/**
 * WebCodecs Frame Buffer - Pre-decodes all video clips into ImageBitmap arrays
 * Uses VideoDecoder for hardware-accelerated H.264/VP9/AV1 decoding
 * Converts VideoFrames to ImageBitmaps for persistent storage
 * 
 * Based on the working implementation from commit b8e027b6
 * Pre-decodes ALL frames during load for instant random access
 * 
 * IMPORTANT: VideoFrames must be closed immediately after use to free
 * decoder buffers. The decoder has a limited pool of frame buffers
 * and will stop outputting frames if they're not released.
 */

import * as MP4Box from 'mp4box';

function makeFrameKey(clipIndex, localFrame) {
	return `${clipIndex}:${localFrame}`;
}

/**
 * Extract codec description from MP4Box for WebCodecs
 * Uses the proven method from the working commit b8e027b6
 * @param {Object} mp4boxFile - The MP4Box file object
 * @param {Object} track - The video track from MP4Box info
 * @returns {ArrayBuffer | null}
 */
function extractCodecDescription(mp4boxFile, track) {
	try {
		const trak = mp4boxFile.getTrackById(track.id);
		if (!trak) {
			console.warn('[WebCodecsFrameBuffer] Could not get track by id:', track.id);
			return null;
		}

		const codec = track.codec || '';
		
		// H.264/AVC
		if (codec.startsWith('avc1') || codec.startsWith('avc3')) {
			const avcC = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.avcC;
			if (avcC && mp4boxFile.stream?.buffer) {
				const description = mp4boxFile.stream.buffer.slice(
					avcC.start + 8,
					avcC.start + avcC.size
				);
				console.log('[WebCodecsFrameBuffer] Extracted avcC description:', description.byteLength, 'bytes');
				return description;
			}
		}
		
		// H.265/HEVC
		if (codec.startsWith('hvc1') || codec.startsWith('hev1')) {
			const hvcC = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.hvcC;
			if (hvcC && mp4boxFile.stream?.buffer) {
				const description = mp4boxFile.stream.buffer.slice(
					hvcC.start + 8,
					hvcC.start + hvcC.size
				);
				console.log('[WebCodecsFrameBuffer] Extracted hvcC description:', description.byteLength, 'bytes');
				return description;
			}
		}
		
		// VP9
		if (codec.startsWith('vp09')) {
			const vpcC = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.vpcC;
			if (vpcC && mp4boxFile.stream?.buffer) {
				const description = mp4boxFile.stream.buffer.slice(
					vpcC.start + 8,
					vpcC.start + vpcC.size
				);
				console.log('[WebCodecsFrameBuffer] Extracted vpcC description:', description.byteLength, 'bytes');
				return description;
			}
		}
		
		// AV1
		if (codec.startsWith('av01')) {
			const av1C = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.av1C;
			if (av1C && mp4boxFile.stream?.buffer) {
				const description = mp4boxFile.stream.buffer.slice(
					av1C.start + 8,
					av1C.start + av1C.size
				);
				console.log('[WebCodecsFrameBuffer] Extracted av1C description:', description.byteLength, 'bytes');
				return description;
			}
		}

		console.warn('[WebCodecsFrameBuffer] No codec description found for codec:', codec);
		return null;
	} catch (err) {
		console.error('[WebCodecsFrameBuffer] Failed to extract codec description:', err);
		return null;
	}
}

export class WebCodecsFrameBuffer {
	constructor({ targetFps = 24 } = {}) {
		/** @type {Map<number, ImageBitmap[]>} - Decoded frames per clip (GPU-resident via ImageBitmap) */
		this.clips = new Map();

		/** @type {number[]} - cumulative frame counts for global indexing */
		this.clipOffsets = [0];

		this.totalFrames = 0;
		this.isLoading = false;
		this.loadProgress = 0;

		this.targetFps = targetFps;

		// Output dimensions (will be set per video)
		this.outputWidth = 1920;
		this.outputHeight = 1080;
	}

	/**
	 * Pre-decode all video files into memory
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

		let totalDecoded = 0;
		const totalFiles = files.length;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			onProgress(totalDecoded / totalFiles, `Decoding ${file.name}...`);

			const frames = await this.decodeVideo(file, (frameProgress) => {
				const overallProgress = (i + frameProgress) / totalFiles;
				onProgress(overallProgress, `Decoding ${file.name}... ${Math.round(frameProgress * 100)}%`);
			});

			this.clips.set(i, frames);
			this.totalFrames += frames.length;
			this.clipOffsets.push(this.totalFrames);

			totalDecoded++;
			console.log(`[WebCodecsFrameBuffer] Clip ${i} decoded: ${frames.length} frames`);
		}

		this.isLoading = false;
		onProgress(1, `Ready - ${this.totalFrames} frames loaded`);
		console.log(`[WebCodecsFrameBuffer] All clips decoded. Total: ${this.totalFrames} frames across ${files.length} clips`);
	}

	/**
	 * Decode a single video file into ImageBitmap array (GPU-resident for WebGL)
	 * Based on the working implementation from commit b8e027b6
	 * VideoFrames are converted to ImageBitmap and closed immediately to free decoder buffers
	 * @param {File} file
	 * @param {(progress: number) => void} onProgress
	 * @returns {Promise<ImageBitmap[]>}
	 */
	async decodeVideo(file, onProgress = () => {}) {
		return new Promise((resolve, reject) => {
			const frames = [];
			let totalSamples = 0;
			let samplesSubmitted = 0;
			let allSamplesExtracted = false;
			let videoWidth = 1920;
			let videoHeight = 1080;

			const mp4boxfile = MP4Box.createFile();
			let videoDecoder = null;

			let decoderClosed = false;
			
			const checkComplete = () => {
				if (allSamplesExtracted && frames.length >= totalSamples && !decoderClosed) {
					decoderClosed = true;
					try {
						videoDecoder?.close();
					} catch (e) {
						// Ignore if already closed
					}
					// Update output dimensions from the decoded video
					this.outputWidth = videoWidth;
					this.outputHeight = videoHeight;
					resolve(frames);
				}
			};

			mp4boxfile.onReady = (info) => {
				// Use info.tracks.find() - pattern from working commit b8e027b6
				const videoTrack = info.tracks.find(t => t.type === 'video');
				if (!videoTrack) {
					reject(new Error('No video track found'));
					return;
				}

				totalSamples = videoTrack.nb_samples;
				videoWidth = videoTrack.video?.width || 1920;
				videoHeight = videoTrack.video?.height || 1080;
				
				console.log(`[WebCodecsFrameBuffer] Video has ${totalSamples} samples, ${videoWidth}x${videoHeight}`);

				const config = {
					codec: videoTrack.codec,
					codedWidth: videoWidth,
					codedHeight: videoHeight
					// Note: not specifying hardwareAcceleration to let browser decide
				};

				// Extract codec-specific description using the working method
				const description = extractCodecDescription(mp4boxfile, videoTrack);
				if (description) {
					config.description = description;
				}

				videoDecoder = new VideoDecoder({
					output: (frame) => {
						// CRITICAL: Must close VideoFrame to free decoder buffers!
						// Create ImageBitmap copy (GPU-resident for WebGL) then close original
						createImageBitmap(frame).then(bitmap => {
							frames.push(bitmap);
							if (frames.length === 1 || frames.length % 50 === 0) {
								console.log(`[WebCodecsFrameBuffer] Frame decoded: ${frames.length}/${totalSamples}`);
							}
							onProgress(frames.length / totalSamples);
							checkComplete();
						}).catch(e => {
							console.error('[WebCodecsFrameBuffer] Failed to create ImageBitmap:', e);
						}).finally(() => {
							// Always close the VideoFrame immediately to free decoder buffers
							frame.close();
						});
					},
					error: (e) => {
						console.error('[WebCodecsFrameBuffer] Decode error:', e);
						// Don't reject immediately - try to continue with other frames
					}
				});

				// Configure decoder directly (matching working commit pattern)
				videoDecoder.configure(config);
				console.log('[WebCodecsFrameBuffer] Decoder configured for', videoTrack.codec);
				
				// Start sample extraction
				mp4boxfile.setExtractionOptions(videoTrack.id, null, { nbSamples: 200 });
				mp4boxfile.start();
				console.log('[WebCodecsFrameBuffer] Started sample extraction');
			};

			mp4boxfile.onSamples = (trackId, ref, samples) => {
				console.log(`[WebCodecsFrameBuffer] onSamples called: ${samples.length} samples, decoder state: ${videoDecoder?.state}`);
				
				for (const sample of samples) {
					if (videoDecoder?.state === 'configured') {
						try {
							// Use timestamps as-is (matching original working code)
							videoDecoder.decode(new EncodedVideoChunk({
								type: sample.is_sync ? 'key' : 'delta',
								timestamp: sample.cts,
								duration: sample.duration,
								data: sample.data
							}));
							samplesSubmitted++;
						} catch (e) {
							console.error(`[WebCodecsFrameBuffer] Failed to decode sample ${samplesSubmitted}:`, e);
						}
					}
				}
				
				console.log(`[WebCodecsFrameBuffer] Submitted ${samplesSubmitted}/${totalSamples} samples, decoded ${frames.length} frames`);

				// Check if we've submitted all samples
				if (samplesSubmitted >= totalSamples && !allSamplesExtracted) {
					allSamplesExtracted = true;
					console.log('[WebCodecsFrameBuffer] All samples submitted, flushing decoder...');
					// Flush decoder to ensure all frames are output
					videoDecoder?.flush().then(() => {
						console.log(`[WebCodecsFrameBuffer] Flush complete, ${frames.length}/${totalSamples} frames decoded`);
						// Wait a bit more for any remaining frames, then check completion
						const waitForFrames = () => {
							if (frames.length >= totalSamples) {
								console.log(`[WebCodecsFrameBuffer] All ${frames.length} frames received`);
								checkComplete();
							} else {
								// Give decoder more time to output remaining frames
								console.log(`[WebCodecsFrameBuffer] Waiting for remaining frames: ${frames.length}/${totalSamples}`);
								setTimeout(() => {
									if (frames.length >= totalSamples) {
										checkComplete();
									} else {
										// If still not all frames after another wait, resolve with what we have
										console.warn(`[WebCodecsFrameBuffer] Giving up waiting, got ${frames.length}/${totalSamples} frames`);
										if (frames.length > 0 && !decoderClosed) {
											decoderClosed = true;
											try {
												videoDecoder?.close();
											} catch (e) {
												// Ignore if already closed
											}
											resolve(frames);
										}
									}
								}, 1000);
							}
						};
						waitForFrames();
					}).catch((e) => {
						console.error('[WebCodecsFrameBuffer] Flush failed:', e);
						// Still try to resolve with partial frames
						if (frames.length > 0 && !decoderClosed) {
							decoderClosed = true;
							try {
								videoDecoder?.close();
							} catch (closeErr) {
								// Ignore if already closed
							}
							resolve(frames);
						} else if (!decoderClosed) {
							reject(e);
						}
					});
				}
			};

			mp4boxfile.onError = (e) => {
				// Handle non-fatal MP4Box errors
				if (e && typeof e === 'string' && (e.includes('BoxParser') || e.includes('Invalid box'))) {
					console.warn('[WebCodecsFrameBuffer] MP4Box parsing warning (non-fatal):', e);
				} else {
					reject(e);
				}
			};

			// Read file
			const reader = new FileReader();
			reader.onload = (e) => {
				const buffer = e.target.result;
				buffer.fileStart = 0;
				mp4boxfile.appendBuffer(buffer);
				mp4boxfile.flush();
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(file);

			// Timeout for decoding
			setTimeout(() => {
				if (frames.length === 0) {
					reject(new Error('Video decoding timeout - no frames decoded'));
				} else if (frames.length < totalSamples) {
					console.warn(`[WebCodecsFrameBuffer] Partial decode: got ${frames.length}/${totalSamples} frames`);
					videoDecoder?.close();
					resolve(frames);
				}
			}, 60000); // 60 second timeout
		});
	}

	/**
	 * Get frame by global index (across all clips)
	 * @param {number} globalIndex
	 * @returns {ImageBitmap | null}
	 */
	getFrame(globalIndex) {
		if (this.totalFrames === 0) return null;

		// Wrap around for looping
		const wrappedIndex = ((globalIndex % this.totalFrames) + this.totalFrames) % this.totalFrames;

		// Find which clip this frame belongs to
		for (let clipIndex = 0; clipIndex < this.clips.size; clipIndex++) {
			const clipStart = this.clipOffsets[clipIndex];
			const clipEnd = this.clipOffsets[clipIndex + 1];

			if (wrappedIndex >= clipStart && wrappedIndex < clipEnd) {
				const localFrame = wrappedIndex - clipStart;
				const clip = this.clips.get(clipIndex);
				if (clip && clip[0]) {
					// ImageBitmap uses width/height
					this.outputWidth = clip[0].width || this.outputWidth;
					this.outputHeight = clip[0].height || this.outputHeight;
				}
				return clip?.[localFrame] || null;
			}
		}

		return null;
	}

	/**
	 * Get frame from specific clip
	 * @param {number} clipIndex
	 * @param {number} localFrame
	 * @returns {ImageBitmap | null}
	 */
	getFrameAt(clipIndex, localFrame) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return null;

		// Wrap within clip
		const wrappedFrame = ((localFrame % clip.length) + clip.length) % clip.length;
		if (clip[0]) {
			// ImageBitmap uses width/height
			this.outputWidth = clip[0].width || this.outputWidth;
			this.outputHeight = clip[0].height || this.outputHeight;
		}
		return clip[wrappedFrame] || null;
	}

	/**
	 * Decode frame at specific position (for API compatibility)
	 * Since all frames are pre-decoded, this is just a cache lookup
	 * @param {number} clipIndex
	 * @param {number} localFrame
	 * @returns {Promise<ImageBitmap | null>}
	 */
	async decodeFrameAt(clipIndex, localFrame) {
		// All frames are pre-decoded, just return from cache
		return this.getFrameAt(clipIndex, localFrame);
	}

	/**
	 * Prime the buffer for frames around a global frame index
	 * Since all frames are pre-decoded, this is a no-op
	 * @param {number} globalFrame
	 */
	primeAroundFrame(globalFrame) {
		// No-op: all frames are pre-decoded during load
		// This method exists for API compatibility
	}

	/**
	 * Ensure the first frame of a clip is decoded and ready
	 * Since all frames are pre-decoded, this just returns the first frame
	 * @param {number} clipIndex
	 * @returns {Promise<ImageBitmap | null>}
	 */
	async ensureFirstFrameReady(clipIndex = 0) {
		return this.getFrameAt(clipIndex, 0);
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
			frameCount: clip.length,
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
	 * Clean up all ImageBitmaps and resources
	 * ImageBitmaps are closed here to free GPU memory
	 */
	dispose() {
		// Close all ImageBitmaps to free GPU memory
		for (const [_, frames] of this.clips) {
			for (const frame of frames) {
				if (frame && typeof frame.close === 'function') {
					frame.close();
				}
			}
		}
		this.clips.clear();
		this.clipOffsets = [0];
		this.totalFrames = 0;
	}
}

// Singleton instance
export const frameBuffer = new WebCodecsFrameBuffer();
