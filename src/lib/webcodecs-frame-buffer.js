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
 * Extract codec description from MP4Box track for WebCodecs
 * Based on webcodecs-api.mdc best practices
 * @param {Object} mp4boxFile - The MP4Box file object (unused but kept for API compatibility)
 * @param {Object} track - The video track from MP4Box info
 * @returns {Uint8Array | null}
 */
function extractCodecDescription(mp4boxFile, track) {
	console.log('[WebCodecsFrameBuffer] Extracting codec description for track:', track.id);
	console.log('[WebCodecsFrameBuffer] Track properties:', Object.keys(track));
	
	try {
		// Method 1: Check track.description.entries (MP4Box standard pattern)
		// Per webcodecs-api.mdc: "Check for pre-packaged avcC box"
		if (track.description?.entries) {
			console.log('[WebCodecsFrameBuffer] Found track.description.entries:', track.description.entries.length);
			for (const entry of track.description.entries) {
				if (entry.boxes) {
					const avccBox = entry.boxes.find(b => b.type === 'avcC');
					if (avccBox?.data) {
						console.log('[WebCodecsFrameBuffer] Found avcC box in description.entries:', avccBox.data.length, 'bytes');
						return avccBox.data;
					}
					const hvccBox = entry.boxes.find(b => b.type === 'hvcC');
					if (hvccBox?.data) {
						console.log('[WebCodecsFrameBuffer] Found hvcC box in description.entries:', hvccBox.data.length, 'bytes');
						return hvccBox.data;
					}
					const av1cBox = entry.boxes.find(b => b.type === 'av1C');
					if (av1cBox?.data) {
						console.log('[WebCodecsFrameBuffer] Found av1C box in description.entries:', av1cBox.data.length, 'bytes');
						return av1cBox.data;
					}
					const vpccBox = entry.boxes.find(b => b.type === 'vpcC');
					if (vpccBox?.data) {
						console.log('[WebCodecsFrameBuffer] Found vpcC box in description.entries:', vpccBox.data.length, 'bytes');
						return vpccBox.data;
					}
				}
			}
		}

		// Method 2: Check track.avcC directly (MP4Box alternative structure)
		// Per webcodecs-api.mdc: "Manually construct from SPS/PPS"
		if (track.avcC) {
			console.log('[WebCodecsFrameBuffer] Found track.avcC, properties:', Object.keys(track.avcC));
			
			// Check for direct data property
			if (track.avcC.data instanceof Uint8Array) {
				console.log('[WebCodecsFrameBuffer] Found avcC.data directly:', track.avcC.data.length, 'bytes');
				return track.avcC.data;
			}
			
			// Build from SPS/PPS arrays
			if (track.avcC.SPS && track.avcC.PPS) {
				const description = buildAvccFromSpsPps(track.avcC);
				if (description) {
					console.log('[WebCodecsFrameBuffer] Built avcC from SPS/PPS:', description.length, 'bytes');
					return description;
				}
			}
		}

		// Method 3: Check video property which MP4Box sometimes uses
		if (track.video) {
			console.log('[WebCodecsFrameBuffer] Found track.video, properties:', Object.keys(track.video));
			if (track.video.avcC?.data) {
				console.log('[WebCodecsFrameBuffer] Found video.avcC.data:', track.video.avcC.data.length, 'bytes');
				return track.video.avcC.data;
			}
		}

		// Method 4: Look for raw_descriptor which some MP4s have
		if (track.raw_descriptor instanceof Uint8Array) {
			console.log('[WebCodecsFrameBuffer] Found raw_descriptor:', track.raw_descriptor.length, 'bytes');
			return track.raw_descriptor;
		}

		console.warn('[WebCodecsFrameBuffer] Could not extract codec description');
		console.warn('[WebCodecsFrameBuffer] Track dump:', JSON.stringify(track, (key, value) => {
			if (value instanceof Uint8Array) return `Uint8Array(${value.length})`;
			if (value instanceof ArrayBuffer) return `ArrayBuffer(${value.byteLength})`;
			return value;
		}, 2).slice(0, 2000));
		
		return null;
	} catch (err) {
		console.error('[WebCodecsFrameBuffer] Failed to extract codec description:', err);
		return null;
	}
}

/**
 * Build AVCDecoderConfigurationRecord from SPS/PPS arrays
 * @param {Object} avcC - Object containing SPS and PPS arrays
 * @returns {Uint8Array | null}
 */
function buildAvccFromSpsPps(avcC) {
	try {
		const spsArray = avcC.SPS || [];
		const ppsArray = avcC.PPS || [];
		
		if (spsArray.length === 0 || ppsArray.length === 0) {
			console.warn('[WebCodecsFrameBuffer] Missing SPS or PPS data');
			return null;
		}

		// Get first SPS for profile info
		const firstSps = spsArray[0];
		const spsData = firstSps.nalu || firstSps;
		
		if (!(spsData instanceof Uint8Array) && !Array.isArray(spsData)) {
			console.warn('[WebCodecsFrameBuffer] Invalid SPS data type:', typeof spsData);
			return null;
		}

		// Calculate total size
		let totalSize = 6; // Header: version(1) + profile(1) + compat(1) + level(1) + lengthSize(1) + numSPS(1)
		for (const sps of spsArray) {
			const data = sps.nalu || sps;
			totalSize += 2 + data.length; // length(2) + data
		}
		totalSize += 1; // numPPS
		for (const pps of ppsArray) {
			const data = pps.nalu || pps;
			totalSize += 2 + data.length; // length(2) + data
		}

		const buffer = new Uint8Array(totalSize);
		let offset = 0;

		// AVCDecoderConfigurationRecord header
		buffer[offset++] = 1; // configurationVersion
		buffer[offset++] = spsData[1] || 0x42; // AVCProfileIndication
		buffer[offset++] = spsData[2] || 0x00; // profile_compatibility
		buffer[offset++] = spsData[3] || 0x1e; // AVCLevelIndication
		buffer[offset++] = 0xFF; // lengthSizeMinusOne (3 = 4-byte NAL lengths)
		buffer[offset++] = 0xE0 | spsArray.length; // numOfSequenceParameterSets

		// Write SPS entries
		for (const sps of spsArray) {
			const data = sps.nalu || sps;
			buffer[offset++] = (data.length >> 8) & 0xFF;
			buffer[offset++] = data.length & 0xFF;
			buffer.set(data, offset);
			offset += data.length;
		}

		// Write PPS count and entries
		buffer[offset++] = ppsArray.length;
		for (const pps of ppsArray) {
			const data = pps.nalu || pps;
			buffer[offset++] = (data.length >> 8) & 0xFF;
			buffer[offset++] = data.length & 0xFF;
			buffer.set(data, offset);
			offset += data.length;
		}

		return buffer;
	} catch (err) {
		console.error('[WebCodecsFrameBuffer] Failed to build avcC from SPS/PPS:', err);
		return null;
	}
}

export class WebCodecsFrameBuffer {
	constructor({ maxFrames = 240, targetFps = 24 } = {}) {
		/** @type {Map<number, { file: File, url: string, decoder: VideoDecoder, frameCount: number, width: number, height: number, duration: number, chunks: Map<number, EncodedVideoChunk>, nextChunkIndex: number, decoderOutputQueue: Array<{resolve: Function, reject: Function}>, lastDecodedFrame: number }>} */
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

					// Extract codec description for WebCodecs
					// This is required for H.264/H.265 and optional for VP9/AV1
					description = extractCodecDescription(mp4boxfile, videoTrack);
					
					if (!description && (codecString.includes('avc1') || codecString.includes('hvc1') || codecString.includes('hev1'))) {
						console.warn('[WebCodecsFrameBuffer] Warning: No description for H.264/H.265 codec - decoding may fail');
					}

					console.log(`[WebCodecsFrameBuffer] Video info: ${codecString} ${videoWidth}x${videoHeight}, ${frameCount} frames, ${duration.toFixed(2)}s, description: ${description ? description.length + ' bytes' : 'none'}`);

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

		// Create output queue for routing decoded frames to the correct pending promise
		const decoderOutputQueue = [];

		// Create VideoDecoder with discovered codec
		const decoder = new VideoDecoder({
			output: (frame) => {
				// Route decoded frame to the next waiting promise in the queue
				const pending = decoderOutputQueue.shift();
				if (pending) {
					pending.resolve(frame);
				} else {
					// No one waiting for this frame - close it to avoid memory leak
					console.warn('[WebCodecsFrameBuffer] Received unexpected frame, closing it');
					frame.close();
				}
			},
			error: (error) => {
				console.error('[WebCodecsFrameBuffer] Decoder error:', error);
				// Reject all pending decodes
				while (decoderOutputQueue.length > 0) {
					const pending = decoderOutputQueue.shift();
					pending.reject(error);
				}
			}
		});

		// Determine codec string for VideoDecoder.configure()
		let decoderCodec = codecString;

		// WebCodecs-only decoding
		let useWebCodecs = true;
		
		// Build decoder config
		const decoderConfig = {
			codec: decoderCodec,
			codedWidth: videoWidth,
			codedHeight: videoHeight,
			hardwareAcceleration: 'prefer-hardware'
		};
		
		// Only include description if we have one (required for H.264/H.265)
		if (description) {
			decoderConfig.description = description;
		}

		console.log('[WebCodecsFrameBuffer] Attempting to configure decoder with:', {
			codec: decoderConfig.codec,
			codedWidth: decoderConfig.codedWidth,
			codedHeight: decoderConfig.codedHeight,
			hasDescription: !!description,
			descriptionLength: description?.length
		});

		try {
			// First check if the config is supported
			const support = await VideoDecoder.isConfigSupported(decoderConfig);
			console.log('[WebCodecsFrameBuffer] Config support check result:', support);
			
			if (!support.supported) {
				throw new Error(`Codec ${decoderCodec} not supported by VideoDecoder`);
			}
			
			// Use the potentially modified config from isConfigSupported
			decoder.configure(support.config);
			console.log('[WebCodecsFrameBuffer] Decoder configured successfully for', decoderCodec, 
				description ? `with ${description.length} byte description` : 'without description');
		} catch (err) {
			console.error('[WebCodecsFrameBuffer] WebCodecs configuration failed for codec', decoderCodec, err);
			console.error('[WebCodecsFrameBuffer] Config was:', decoderConfig);
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
			decoderOutputQueue: useWebCodecs ? decoderOutputQueue : [],
			useWebCodecs,
			frameCount: frameCount || Math.max(1, Math.round(duration * this.targetFps)),
			width: videoWidth,
			height: videoHeight,
			duration,
			chunks: new Map(),
			nextChunkIndex: 0,
			lastDecodedFrame: -1,
			keyframeSamples: [], // Will store keyframe indices for seeking
			// Store codec info for decoder reset
			codecString: decoderCodec,
			description: description,
			needsReset: false
		};
	}

	/**
	 * Decode a single frame on demand using WebCodecs
	 * Handles keyframe dependencies by decoding from the nearest keyframe
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

				// Extract all samples from this clip if not done yet
				await this.extractAllSamples(clipIndex);

				// Determine which frames we need to decode
				// H.264 delta frames depend on previous frames back to a keyframe
				const framesToDecode = this.getFramesToDecode(clipIndex, wrappedFrame);
				
				// Handle decoder reset if seeking backwards
				if (clip.needsReset) {
					await this.resetDecoderState(clipIndex);
					clip.needsReset = false;
				}
				
				if (framesToDecode.length === 0) {
					throw new Error(`No frames to decode for frame ${wrappedFrame}`);
				}

				let lastFrame = null;

				// Decode each required frame in sequence
				for (const frameIdx of framesToDecode) {
					const chunk = clip.chunks.get(frameIdx);
					if (!chunk) {
						console.warn(`[WebCodecsFrameBuffer] Missing chunk for frame ${frameIdx}`);
						continue;
					}

					const frame = await this.decodeChunk(clip, chunk);
					
					// Store the frame in cache
					const frameKey = makeFrameKey(clipIndex, frameIdx);
					if (!this.frameCache.has(frameKey)) {
						this.storeFrame(frameKey, clipIndex, frameIdx, frame);
					}
					
					// Track the last frame if this is our target
					if (frameIdx === wrappedFrame) {
						lastFrame = frame;
					}
					
					clip.lastDecodedFrame = frameIdx;
				}

				return lastFrame;
			} catch (error) {
				console.error(`[WebCodecsFrameBuffer] WebCodecs decode failed for frame ${wrappedFrame}:`, error);
				return null;
			}
		})();

		this.pendingDecodes.set(key, decodePromise);
		const result = await decodePromise;
		this.pendingDecodes.delete(key);

		// Frame is already stored by the decode loop, just return it
		return result;
	}

	/**
	 * Decode a single EncodedVideoChunk and return the VideoFrame
	 * @param {Object} clip
	 * @param {EncodedVideoChunk} chunk
	 * @returns {Promise<VideoFrame>}
	 */
	async decodeChunk(clip, chunk) {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Decode timeout for chunk at timestamp ${chunk.timestamp}`));
			}, 5000);

			// Add to output queue - the decoder's output callback will resolve this
			clip.decoderOutputQueue.push({
				resolve: (frame) => {
					clearTimeout(timeout);
					resolve(frame);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				}
			});

			clip.decoder.decode(chunk);
		});
	}

	/**
	 * Get the list of frame indices that need to be decoded to reach the target frame
	 * Handles keyframe dependencies for H.264/HEVC codecs
	 * @param {number} clipIndex
	 * @param {number} targetFrame
	 * @returns {number[]}
	 */
	getFramesToDecode(clipIndex, targetFrame) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return [];

		const framesToDecode = [];

		// Find the nearest keyframe at or before targetFrame
		let keyframeIdx = -1;
		for (let i = targetFrame; i >= 0; i--) {
			const chunk = clip.chunks.get(i);
			if (chunk && chunk.type === 'key') {
				keyframeIdx = i;
				break;
			}
		}

		if (keyframeIdx === -1) {
			// No keyframe found, try to use first frame (assume it's a keyframe)
			keyframeIdx = 0;
		}

		// Determine starting point: either the keyframe or just after last decoded frame
		let startFrame = keyframeIdx;
		
		// If we need to go backwards (seeking), we must reset from keyframe
		// If we've already decoded past the keyframe and before target, we can continue from there
		if (clip.lastDecodedFrame >= keyframeIdx && clip.lastDecodedFrame < targetFrame) {
			// We can continue from where we left off
			startFrame = clip.lastDecodedFrame + 1;
		} else if (clip.lastDecodedFrame > targetFrame || clip.lastDecodedFrame < keyframeIdx) {
			// Seeking backwards or to a different keyframe group - mark for reset
			// The actual reset will be done synchronously before decoding
			clip.needsReset = true;
			startFrame = keyframeIdx;
		}

		// Build list of frames to decode
		for (let i = startFrame; i <= targetFrame; i++) {
			// Skip if already cached (and not seeking backwards)
			const frameKey = makeFrameKey(clipIndex, i);
			if (!this.frameCache.has(frameKey)) {
				framesToDecode.push(i);
			}
		}

		// If target is already cached, return empty (but this shouldn't happen due to earlier check)
		if (framesToDecode.length === 0 || framesToDecode[framesToDecode.length - 1] !== targetFrame) {
			// Target is cached, no need to decode
			return [];
		}

		return framesToDecode;
	}

	/**
	 * Reset decoder state for a clip (needed when seeking backwards)
	 * @param {number} clipIndex
	 */
	async resetDecoderState(clipIndex) {
		const clip = this.clips.get(clipIndex);
		if (!clip || !clip.decoder) return;

		try {
			// Reset the decoder to clear its internal state
			clip.decoder.reset();
			
			// After reset, decoder needs to be reconfigured
			// Re-read the codec info from the stored data
			clip.decoder.configure({
				codec: clip.codecString || 'avc1.42001e',
				codedWidth: clip.width,
				codedHeight: clip.height,
				description: clip.description,
				hardwareAcceleration: 'prefer-hardware'
			});
			
			clip.lastDecodedFrame = -1;
			clip.decoderOutputQueue.length = 0; // Clear any pending outputs
			console.log(`[WebCodecsFrameBuffer] Reset decoder state for clip ${clipIndex}`);
		} catch (error) {
			console.warn('[WebCodecsFrameBuffer] Error resetting decoder:', error);
		}
	}


	/**
	 * Extract all video samples from MP4 file upfront
	 * This is more efficient than extracting samples one at a time and
	 * ensures we have all keyframe information for proper decoding
	 * @param {number} clipIndex
	 * @returns {Promise<void>}
	 */
	async extractAllSamples(clipIndex) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return;

		// If we already have chunks, skip extraction
		if (clip.chunks.size > 0) return;

		return new Promise((resolve, reject) => {
			const mp4boxfile = MP4Box.createFile();
			let resolved = false;

			mp4boxfile.onReady = (info) => {
				const videoTrack = info.tracks.find(t => t.type === 'video');
				if (!videoTrack) {
					reject(new Error('No video track in MP4'));
					return;
				}

				// Extract ALL samples from the video track
				mp4boxfile.setExtractionOptions(videoTrack.id, null, {
					nbSamples: videoTrack.nb_samples
				});
				mp4boxfile.start();
			};

			mp4boxfile.onSamples = (trackId, ref, samples) => {
				for (const sample of samples) {
					// sample.number is 1-based in MP4Box
					const frameIndex = sample.number - 1;
					const chunk = new EncodedVideoChunk({
						type: sample.is_sync ? 'key' : 'delta',
						timestamp: sample.cts,
						duration: sample.duration,
						data: sample.data
					});
					clip.chunks.set(frameIndex, chunk);
				}

				// Check if we've received all samples
				if (clip.chunks.size >= clip.frameCount && !resolved) {
					resolved = true;
					console.log(`[WebCodecsFrameBuffer] Extracted ${clip.chunks.size} samples for clip ${clipIndex}`);
					resolve();
				}
			};

			mp4boxfile.onError = (e) => {
				if (typeof e === 'string' && (e.includes('BoxParser') || e.includes('Invalid box'))) {
					console.warn('[WebCodecsFrameBuffer] MP4Box parsing warning:', e);
				} else if (!resolved) {
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
					
					// Give onSamples a moment to be called, then resolve if we have enough
					setTimeout(() => {
						if (!resolved && clip.chunks.size > 0) {
							resolved = true;
							console.log(`[WebCodecsFrameBuffer] Extracted ${clip.chunks.size} samples for clip ${clipIndex} (partial)`);
							resolve();
						}
					}, 500);
				} catch (error) {
					if (!resolved) {
						reject(error);
					}
				}
			};

			reader.onerror = (error) => {
				if (!resolved) reject(error);
			};
			reader.readAsArrayBuffer(clip.file);

			// Timeout for extraction
			setTimeout(() => {
				if (!resolved) {
					resolved = true;
					if (clip.chunks.size > 0) {
						console.log(`[WebCodecsFrameBuffer] Extraction timeout but got ${clip.chunks.size} samples`);
						resolve();
					} else {
						reject(new Error('Sample extraction timeout - no samples received'));
					}
				}
			}, 30000);
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
