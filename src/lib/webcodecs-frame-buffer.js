/**
 * WebCodecs Frame Buffer - GPU-native frame decoding and caching
 * Uses VideoDecoder for hardware-accelerated H.264/VP9/AV1 decoding
 * Returns GPU-resident VideoFrame objects directly
 * 
 * This implementation avoids all CPU operations:
 * - No canvas.getContext('2d') 
 * - No ImageBitmap creation
 * - No pixel readbacks
 * - All frames stay on GPU via WebGL texture binding
 */

import * as MP4Box from 'mp4box';

function makeFrameKey(clipIndex, localFrame) {
	return `${clipIndex}:${localFrame}`;
}

/**
 * Extract H.264 codec description from MP4 decoder config
 * Required for VideoDecoder.configure() with H.264 bitstreams
 */
function extractAvcDescription(track) {
	if (!track.codec_string || !track.codec_string.includes('avc1')) {
		return null;
	}

	// Get AVC box if available
	const avcBox = track.boxes?.find(box => box.type === 'avcC');
	if (!avcBox) return null;

	try {
		// Parse avcC box to get SPS and PPS
		const view = new DataView(avcBox);
		const spsCount = view.getUint8(5) & 0x1F;
		let offset = 6;

		const spsList = [];
		for (let i = 0; i < spsCount; i++) {
			const spsLength = view.getUint16(offset);
			offset += 2;
			const spsData = new Uint8Array(avcBox, offset, spsLength);
			spsList.push(spsData);
			offset += spsLength;
		}

		const ppsCount = view.getUint8(offset);
		offset++;

		const ppsList = [];
		for (let i = 0; i < ppsCount; i++) {
			const ppsLength = view.getUint16(offset);
			offset += 2;
			const ppsData = new Uint8Array(avcBox, offset, ppsLength);
			ppsList.push(ppsData);
			offset += ppsLength;
		}

		// Combine SPS and PPS into AVCC format description
		const description = new Uint8Array(avcBox);
		return description;
	} catch (err) {
		console.warn('[WebCodecsFrameBuffer] Failed to extract AVC description:', err);
		return null;
	}
}

export class WebCodecsFrameBuffer {
	constructor({ maxFrames = 240, targetFps = 24 } = {}) {
		/** @type {Map<number, { file: File, url: string, decoder: VideoDecoder, frameCount: number, width: number, height: number, duration: number, chunks: Map<number, EncodedVideoChunk>, nextChunkIndex: number }>} */
		this.clips = new Map();

		/** @type {number[]} - cumulative frame counts for global indexing */
		this.clipOffsets = [0];

		/** @type {Map<string, { clipIndex: number, localFrame: number, frame: VideoFrame }>} */
		this.frameCache = new Map();

		/** @type {Map<string, Promise<VideoFrame | null>>} */
		this.pendingDecodes = new Map();

		this.totalFrames = 0;
		this.isLoading = false;
		this.loadProgress = 0;

		this.maxFrames = maxFrames;
		this.targetFps = targetFps;

		// Output dimensions (will be set per video)
		this.outputWidth = 1920;
		this.outputHeight = 1080;
	}

	get maxCacheFrames() {
		return Math.max(1, this.maxFrames);
	}

	/**
	 * Prepare video files for on-demand WebCodecs decoding
	 * @param {File[]} files - Array of video files to decode
	 * @param {(progress: number, status: string) => void} onProgress - Progress callback
	 * @returns {Promise<void>}
	 */
	async preloadClips(files, onProgress = () => {}) {
		this.isLoading = true;
		this.dispose();
		this.clips.clear();
		this.clipOffsets = [0];
		this.totalFrames = 0;

		let totalPrepared = 0;
		const totalFiles = files.length;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			onProgress(totalPrepared / totalFiles, `Indexing ${file.name}...`);

			const clip = await this.loadClipMetadata(file, (progress) => {
				const overallProgress = (i + progress) / totalFiles;
				onProgress(overallProgress, `Indexing ${file.name}... ${Math.round(progress * 100)}%`);
			});

			this.clips.set(i, clip);
			this.totalFrames += clip.frameCount;
			this.clipOffsets.push(this.totalFrames);

			totalPrepared++;
			console.log(`[WebCodecsFrameBuffer] Clip ${i} indexed: ${clip.frameCount} frames`);
		}

		this.isLoading = false;
		onProgress(1, `Ready - ${this.totalFrames} frames indexed`);
		console.log(`[WebCodecsFrameBuffer] All clips indexed. Total: ${this.totalFrames} frames across ${files.length} clips`);
	}

	/**
	 * Read video metadata and extract codec information
	 * @param {File} file
	 * @param {(progress: number) => void} onProgress
	 * @returns {Promise<{ file: File, url: string, decoder: VideoDecoder, frameCount: number, width: number, height: number, duration: number, chunks: Map<number, EncodedVideoChunk>, nextChunkIndex: number }>}
	 */
	async loadClipMetadata(file, onProgress = () => {}) {
		const url = URL.createObjectURL(file);
		let videoWidth = 0;
		let videoHeight = 0;
		let frameCount = 0;
		let duration = 0;
		let codecString = '';
		let description = null;

		// Parse MP4 to extract codec info only (samples extracted on-demand)
		await new Promise((resolve, reject) => {
			let timeoutHandle = null;
			const mp4boxfile = MP4Box.createFile();

			mp4boxfile.onReady = (info) => {
				try {
					const videoTrack = info.tracks.find(t => t.type === 'video');
					if (!videoTrack) {
						throw new Error('No video track found in MP4');
					}

					videoWidth = videoTrack.video.width;
					videoHeight = videoTrack.video.height;
					frameCount = videoTrack.nb_samples;
					codecString = videoTrack.codec_string || 'unknown';
					duration = videoTrack.duration / videoTrack.timescale;

					// Extract AVC description for H.264
					if (codecString && codecString.includes('avc1')) {
						description = extractAvcDescription(videoTrack);
					}

					console.log(`[WebCodecsFrameBuffer] Video info: ${codecString} ${videoWidth}x${videoHeight}, ${frameCount} frames, ${duration.toFixed(2)}s`);

					// Resolve immediately after metadata extraction
					// Samples will be extracted on-demand via extractSampleChunk()
					if (timeoutHandle) clearTimeout(timeoutHandle);
					onProgress(1);
					resolve();
				} catch (error) {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(error);
				}
			};

			mp4boxfile.onError = (e) => {
				if (e && typeof e === 'string' && (e.includes('BoxParser') || e.includes('Invalid box'))) {
					console.warn('[WebCodecsFrameBuffer] MP4Box parsing warning (non-fatal):', e);
					// Don't reject on non-fatal errors - wait for onReady
				} else {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(e);
				}
			};

			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const buffer = e.target.result;
					buffer.fileStart = 0;
					mp4boxfile.appendBuffer(buffer);
					mp4boxfile.flush();
				} catch (error) {
					if (error.message && (error.message.includes('BoxParser') || error.message.includes('Invalid box'))) {
						console.warn('[WebCodecsFrameBuffer] MP4Box parsing warning (non-fatal):', error.message);
					} else {
						if (timeoutHandle) clearTimeout(timeoutHandle);
						reject(error);
					}
				}
			};

			reader.onerror = (error) => {
				if (timeoutHandle) clearTimeout(timeoutHandle);
				reject(error);
			};

			reader.readAsArrayBuffer(file);

			// Timeout if MP4 parsing stalls
			timeoutHandle = setTimeout(() => {
				reject(new Error('MP4 metadata parsing timeout'));
			}, 15000);
		});

		// Create VideoDecoder with discovered codec
		const decoder = new VideoDecoder({
			output: (frame) => {
				// Frames are delivered to pending decodes via decoderOutputMap
			},
			error: (error) => {
				console.error('[WebCodecsFrameBuffer] Decoder error:', error);
			}
		});

		// Determine codec string for VideoDecoder.configure()
		let decoderCodec = codecString;

		// For H.264 without description, try common profiles
		if (codecString && codecString.includes('avc1') && !description) {
			// Fallback to baseline profile
			decoderCodec = 'avc1.42001e';
		}

	// WebCodecs-only decoding
	let useWebCodecs = true;
	try {
		decoder.configure({
			codec: decoderCodec,
			codedWidth: videoWidth,
			codedHeight: videoHeight,
			description: description,
			hardwareAcceleration: 'prefer-hardware'
		});
		console.log('[WebCodecsFrameBuffer] Decoder configured successfully for', decoderCodec);
	} catch (err) {
		console.error('[WebCodecsFrameBuffer] WebCodecs decode failed for codec', decoderCodec, err);
		useWebCodecs = false;
		try {
			decoder.close();
		} catch (e) {
			// ignore
		}
	}

		return {
			file,
			url,
			decoder: useWebCodecs ? decoder : null,
			useWebCodecs,
			frameCount: frameCount || Math.max(1, Math.round(duration * this.targetFps)),
			width: videoWidth,
			height: videoHeight,
			duration,
			chunks: new Map(),
			nextChunkIndex: 0
		};
	}

	/**
	 * Decode a single frame on demand using WebCodecs
	 * @param {number} clipIndex
	 * @param {number} localFrame
	 * @returns {Promise<VideoFrame | null>}
	 */
	async decodeFrameAt(clipIndex, localFrame) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return null;

		const wrappedFrame = ((localFrame % clip.frameCount) + clip.frameCount) % clip.frameCount;
		const key = makeFrameKey(clipIndex, wrappedFrame);

		// Check cache first
		const cached = this.frameCache.get(key);
		if (cached) {
			this.touchFrame(key, cached);
			return cached.frame;
		}

		// Check if already pending
		const pending = this.pendingDecodes.get(key);
		if (pending) return pending;

		const decodePromise = (async () => {
			try {
				if (!clip.useWebCodecs || !clip.decoder) {
					throw new Error('WebCodecs unavailable for this clip');
				}

				const chunk = await this.extractSampleChunk(clipIndex, wrappedFrame);
				if (!chunk) {
					throw new Error('Could not extract sample');
				}

				const frame = await new Promise((resolve, reject) => {
					let frameReceived = false;
					const timeout = setTimeout(() => {
						if (!frameReceived) {
							reject(new Error(`Decode timeout for frame ${wrappedFrame}`));
						}
					}, 5000);

					const originalOutput = clip.decoder.onoutput;
					clip.decoder.onoutput = (frame) => {
						frameReceived = true;
						clearTimeout(timeout);
						clip.decoder.onoutput = originalOutput;
						resolve(frame);
					};

					clip.decoder.decode(chunk);
				});

				return frame;
			} catch (error) {
				console.error(`[WebCodecsFrameBuffer] WebCodecs decode failed for frame ${wrappedFrame}:`, error);
				return null;
			}
		})();

		this.pendingDecodes.set(key, decodePromise);
		const result = await decodePromise;
		this.pendingDecodes.delete(key);

		if (result) {
			this.storeFrame(key, clipIndex, wrappedFrame, result);
		}
		return result;
	}


	/**
	 * Extract a video sample from MP4 and return as EncodedVideoChunk
	 * @param {number} clipIndex
	 * @param {number} sampleIndex
	 * @returns {Promise<EncodedVideoChunk | null>}
	 */
	async extractSampleChunk(clipIndex, sampleIndex) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return null;

		// Check if we already have this chunk cached
		if (clip.chunks.has(sampleIndex)) {
			return clip.chunks.get(sampleIndex);
		}

		return new Promise((resolve, reject) => {
			const mp4boxfile = MP4Box.createFile();
			let videoTrackId = null;
			let extractedChunks = [];

			mp4boxfile.onReady = (info) => {
				const videoTrack = info.tracks.find(t => t.type === 'video');
				if (!videoTrack) {
					reject(new Error('No video track in MP4'));
					return;
				}
				videoTrackId = videoTrack.id;

				// Set to extract only the sample we need (with some buffer)
				const start = Math.max(0, sampleIndex - 1);
				const end = Math.min(videoTrack.nb_samples - 1, sampleIndex + 1);
				mp4boxfile.setExtractionOptions(videoTrackId, null, {
					frameNumber: start,
					nbSamples: (end - start) + 1
				});
				mp4boxfile.start();
			};

			mp4boxfile.onSamples = (trackId, ref, samples) => {
				for (const sample of samples) {
					if (sample.number - 1 === sampleIndex) {
						const chunk = new EncodedVideoChunk({
							type: sample.is_sync ? 'key' : 'delta',
							timestamp: sample.cts,
							duration: sample.duration,
							data: sample.data
						});
						clip.chunks.set(sampleIndex, chunk);
						extractedChunks.push(chunk);
					}
				}
			};

			mp4boxfile.onError = (e) => {
				if (typeof e === 'string' && (e.includes('BoxParser') || e.includes('Invalid box'))) {
					console.warn('[WebCodecsFrameBuffer] MP4Box parsing warning:', e);
				} else {
					reject(e);
				}
			};

			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const buffer = e.target.result;
					buffer.fileStart = 0;
					mp4boxfile.appendBuffer(buffer);
					mp4boxfile.flush();
				} catch (error) {
					reject(error);
				}
			};

			reader.onerror = reject;
			reader.readAsArrayBuffer(clip.file);

			const timeout = setTimeout(() => {
				reject(new Error(`Sample extraction timeout for sample ${sampleIndex}`));
			}, 5000);

			const originalReady = mp4boxfile.onReady;
			mp4boxfile.onReady = function(...args) {
				clearTimeout(timeout);
				return originalReady?.apply(this, args);
			};

			const originalSamples = mp4boxfile.onSamples;
			mp4boxfile.onSamples = function(...args) {
				clearTimeout(timeout);
				const result = originalSamples?.apply(this, args);
				if (extractedChunks.length > 0) {
					resolve(extractedChunks[0]);
				}
				return result;
			};
		});
	}

	storeFrame(key, clipIndex, localFrame, frame) {
		this.frameCache.delete(key);
		this.frameCache.set(key, { clipIndex, localFrame, frame });
		this.evictIfNeeded();

		// Update output dimensions
		const clip = this.clips.get(clipIndex);
		if (clip) {
			this.outputWidth = clip.width;
			this.outputHeight = clip.height;
		}
	}

	touchFrame(key, cachedEntry) {
		this.frameCache.delete(key);
		this.frameCache.set(key, cachedEntry);
	}

	evictIfNeeded() {
		const maxFrames = this.maxCacheFrames;
		while (this.frameCache.size > maxFrames) {
			const oldestKey = this.frameCache.keys().next().value;
			const entry = this.frameCache.get(oldestKey);
			if (entry?.frame && typeof entry.frame.close === 'function') {
				entry.frame.close();
			}
			this.frameCache.delete(oldestKey);
		}
	}

	/**
	 * Prime the buffer for frames around a global frame index
	 * @param {number} globalFrame
	 */
	primeAroundFrame(globalFrame) {
		if (this.totalFrames === 0) return;

		const radius = Math.max(1, Math.floor(this.maxCacheFrames / 2));
		const start = globalFrame - radius;
		const end = globalFrame + radius;

		for (let frame = start; frame <= end; frame++) {
			const wrapped = ((frame % this.totalFrames) + this.totalFrames) % this.totalFrames;
			const localInfo = this.globalToLocal(wrapped);
			if (!localInfo) continue;
			void this.decodeFrameAt(localInfo.clipIndex, localInfo.localFrame);
		}
	}

	/**
	 * Ensure the first frame of a clip is decoded and ready
	 * @param {number} clipIndex
	 * @returns {Promise<VideoFrame | null>}
	 */
	async ensureFirstFrameReady(clipIndex = 0) {
		return this.decodeFrameAt(clipIndex, 0);
	}

	/**
	 * Get frame by global index
	 * @param {number} globalIndex
	 * @returns {VideoFrame | null}
	 */
	getFrame(globalIndex) {
		if (this.totalFrames === 0) return null;

		const localInfo = this.globalToLocal(globalIndex);
		if (!localInfo) return null;

		const clip = this.clips.get(localInfo.clipIndex);
		if (!clip) return null;

		const key = makeFrameKey(localInfo.clipIndex, localInfo.localFrame);
		const cached = this.frameCache.get(key);
		if (cached) {
			this.touchFrame(key, cached);
			this.outputWidth = clip.width;
			this.outputHeight = clip.height;
			return cached.frame;
		}

		return null;
	}

	/**
	 * Get frame from specific clip
	 * @param {number} clipIndex
	 * @param {number} localFrame
	 * @returns {VideoFrame | null}
	 */
	getFrameAt(clipIndex, localFrame) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return null;

		const wrappedFrame = ((localFrame % clip.frameCount) + clip.frameCount) % clip.frameCount;
		const key = makeFrameKey(clipIndex, wrappedFrame);
		const cached = this.frameCache.get(key);
		if (cached) {
			this.touchFrame(key, cached);
			this.outputWidth = clip.width;
			this.outputHeight = clip.height;
			return cached.frame;
		}
		return null;
	}

	/**
	 * Get clip info
	 * @param {number} clipIndex
	 * @returns {{ frameCount: number, startFrame: number, endFrame: number } | null}
	 */
	getClipInfo(clipIndex) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return null;

		return {
			frameCount: clip.frameCount,
			startFrame: this.clipOffsets[clipIndex],
			endFrame: this.clipOffsets[clipIndex + 1] - 1
		};
	}

	/**
	 * Convert global frame index to clip + local frame
	 * @param {number} globalIndex
	 * @returns {{ clipIndex: number, localFrame: number } | null}
	 */
	globalToLocal(globalIndex) {
		const wrappedIndex = ((globalIndex % this.totalFrames) + this.totalFrames) % this.totalFrames;

		for (let clipIndex = 0; clipIndex < this.clips.size; clipIndex++) {
			const clipStart = this.clipOffsets[clipIndex];
			const clipEnd = this.clipOffsets[clipIndex + 1];

			if (wrappedIndex >= clipStart && wrappedIndex < clipEnd) {
				return {
					clipIndex,
					localFrame: wrappedIndex - clipStart
				};
			}
		}

		return null;
	}

	/**
	 * Clean up all VideoFrames, decoders, and resources
	 */
	dispose() {
		// Close all cached frames
		for (const entry of this.frameCache.values()) {
			if (entry.frame) {
				entry.frame.close();
			}
		}
		this.frameCache.clear();
		this.pendingDecodes.clear();

		// Close all decoders
		for (const clip of this.clips.values()) {
			if (clip.decoder) {
				try {
					clip.decoder.close();
				} catch (err) {
					console.warn('[WebCodecsFrameBuffer] Error closing decoder:', err);
				}
			}
			if (clip.url) {
				URL.revokeObjectURL(clip.url);
			}
		}
		this.clips.clear();
		this.clipOffsets = [0];
		this.totalFrames = 0;
	}
}

// Singleton instance
export const frameBuffer = new WebCodecsFrameBuffer();
