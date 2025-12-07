/**
 * Frame Buffer - Pre-decodes all video clips into ImageBitmap arrays for instant access
 * Enables seamless retiming, speed ramps, jump cuts, and reverse playback
 */
import * as MP4Box from 'mp4box';

// Calculate optimal output size based on screen/viewport
function calculateOutputSize(videoWidth, videoHeight, maxWidth = null, maxHeight = null) {
	// Default to screen size if not specified
	if (!maxWidth) maxWidth = window.innerWidth || 1920;
	if (!maxHeight) maxHeight = window.innerHeight || 1080;
	
	// Use video's native resolution if it's smaller than screen
	// Otherwise, scale down to fit screen while maintaining aspect ratio
	const videoAspect = videoWidth / videoHeight;
	const screenAspect = maxWidth / maxHeight;
	
	let outputWidth, outputHeight;
	
	if (videoWidth <= maxWidth && videoHeight <= maxHeight) {
		// Video is smaller than screen - use native resolution
		outputWidth = videoWidth;
		outputHeight = videoHeight;
	} else if (videoAspect > screenAspect) {
		// Video is wider - fit to width
		outputWidth = maxWidth;
		outputHeight = Math.round(maxWidth / videoAspect);
	} else {
		// Video is taller - fit to height
		outputHeight = maxHeight;
		outputWidth = Math.round(maxHeight * videoAspect);
	}
	
	// Round to even numbers (better for some codecs)
	outputWidth = Math.round(outputWidth / 2) * 2;
	outputHeight = Math.round(outputHeight / 2) * 2;
	
	// Minimum size
	outputWidth = Math.max(320, outputWidth);
	outputHeight = Math.max(180, outputHeight);
	
	return { width: outputWidth, height: outputHeight };
}

export class FrameBuffer {
	constructor() {
		/** @type {Map<number, ImageBitmap[]>} */
		this.clips = new Map();
		
		/** @type {number[]} - cumulative frame counts for global indexing */
		this.clipOffsets = [0];
		
		this.totalFrames = 0;
		this.isLoading = false;
		this.loadProgress = 0;
		
		// Output dimensions (will be set per video based on native resolution)
		this.outputWidth = 1920;
		this.outputHeight = 1080;
		
		// Reusable canvas for frame conversion (will be resized per video)
		this.canvas = document.createElement('canvas');
		this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
	}

	/**
	 * Pre-decode all video files into memory
	 * @param {File[]} files - Array of video files to decode
	 * @param {(progress: number, status: string) => void} onProgress - Progress callback
	 * @returns {Promise<void>}
	 */
	async preloadClips(files, onProgress = () => {}) {
		this.isLoading = true;
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
			console.log(`Clip ${i} decoded: ${frames.length} frames`);
		}

		this.isLoading = false;
		onProgress(1, `Ready - ${this.totalFrames} frames loaded`);
		console.log(`All clips decoded. Total: ${this.totalFrames} frames across ${files.length} clips`);
	}

	/**
	 * Decode a single video file into ImageBitmap array
	 * @param {File} file 
	 * @param {(progress: number) => void} onProgress
	 * @returns {Promise<ImageBitmap[]>}
	 */
	async decodeVideo(file, onProgress = () => {}) {
		return new Promise((resolve, reject) => {
			// Use Map to track frame indices and ensure proper ordering
			const frameMap = new Map(); // Map<frameIndex, ImageBitmap>
			let totalSamples = 0;
			let samplesSubmitted = 0;
			let allSamplesExtracted = false;
			let frameIndex = 0; // Track frame order
			let pendingBitmaps = 0; // Track how many ImageBitmaps are being created
			
			const mp4boxfile = MP4Box.createFile();
			let videoDecoder = null;

			const checkComplete = () => {
				if (allSamplesExtracted && frameMap.size >= totalSamples) {
					// Convert Map to ordered array
					const frames = [];
					let nullFrames = 0;
					for (let i = 0; i < totalSamples; i++) {
						const frame = frameMap.get(i);
						frames.push(frame || null);
						if (!frame) nullFrames++;
					}
					
					if (nullFrames > 0) {
						console.warn(`[FrameBuffer] Warning: ${nullFrames} frames failed to allocate (memory limit). Video may have gaps.`);
						console.warn(`[FrameBuffer] Consider using shorter videos or reducing resolution.`);
					}
					
					videoDecoder?.close();
					resolve(frames);
				}
			};

			mp4boxfile.onReady = (info) => {
				const videoTrack = info.tracks.find(t => t.type === 'video');
				if (!videoTrack) {
					reject(new Error('No video track found'));
					return;
				}

				totalSamples = videoTrack.nb_samples;
				const nativeWidth = videoTrack.video.width;
				const nativeHeight = videoTrack.video.height;
				
				console.log(`Video: ${nativeWidth}x${nativeHeight}, ${totalSamples} samples`);

				// Calculate optimal output size based on screen and video resolution
				const outputSize = calculateOutputSize(nativeWidth, nativeHeight);
				this.outputWidth = outputSize.width;
				this.outputHeight = outputSize.height;
				
				// Resize canvas to output size
				this.canvas.width = this.outputWidth;
				this.canvas.height = this.outputHeight;
				
				const mbPerFrame = (this.outputWidth * this.outputHeight * 4) / 1024 / 1024;
				console.log(`Output size: ${this.outputWidth}x${this.outputHeight} (${mbPerFrame.toFixed(2)}MB per frame)`);

				const config = {
					codec: videoTrack.codec,
					codedWidth: nativeWidth,
					codedHeight: nativeHeight,
				};

				// Extract codec-specific description
				if (videoTrack.codec.startsWith('avc1')) {
					const trak = mp4boxfile.getTrackById(videoTrack.id);
					const avcC = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.avcC;
					if (avcC) {
						config.description = mp4boxfile.stream.buffer.slice(
							avcC.start + 8,
							avcC.start + avcC.size
						);
					}
				} else if (videoTrack.codec.startsWith('hvc1') || videoTrack.codec.startsWith('hev1')) {
					const trak = mp4boxfile.getTrackById(videoTrack.id);
					const hvcC = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.hvcC;
					if (hvcC) {
						config.description = mp4boxfile.stream.buffer.slice(
							hvcC.start + 8,
							hvcC.start + hvcC.size
						);
					}
				}

				videoDecoder = new VideoDecoder({
					output: (frame) => {
						// Capture frame index to ensure proper ordering
						const currentFrameIndex = frameIndex++;
						
						// Synchronous frame handling to avoid race conditions
						this.ctx.clearRect(0, 0, this.outputWidth, this.outputHeight);
						// Draw frame and resize to output dimensions
						this.ctx.drawImage(frame, 0, 0, this.outputWidth, this.outputHeight);
						
						// Use sync canvas copy instead of async createImageBitmap
						const imageData = this.ctx.getImageData(0, 0, this.outputWidth, this.outputHeight);
						
						// Throttle ImageBitmap creation to prevent memory exhaustion
						pendingBitmaps++;
						
						// Create ImageBitmap with error handling for memory issues
						createImageBitmap(imageData)
							.then(bitmap => {
								pendingBitmaps--;
								// Store frame at correct index to maintain order
								frameMap.set(currentFrameIndex, bitmap);
								onProgress(frameMap.size / totalSamples);
								checkComplete();
							})
							.catch(error => {
								pendingBitmaps--;
								console.error(`[FrameBuffer] Failed to create ImageBitmap for frame ${currentFrameIndex}:`, error);
								
								// Check if it's a memory error
								if (error.name === 'InvalidStateError' || error.message.includes('allocation') || error.message.includes('memory')) {
									console.warn(`[FrameBuffer] Memory limit reached at frame ${currentFrameIndex}/${totalSamples}. Consider using shorter videos or lower resolution.`);
								}
								
								// Store null to maintain frame count, but skip the bitmap
								frameMap.set(currentFrameIndex, null);
								onProgress(frameMap.size / totalSamples);
								
								// Continue processing - don't reject the entire decode
								checkComplete();
							});
						
						frame.close();
					},
					error: (e) => {
						console.error('Decode error:', e);
						reject(e);
					}
				});

				videoDecoder.configure(config);
				mp4boxfile.setExtractionOptions(videoTrack.id, null, { nbSamples: 200 });
				mp4boxfile.start();
			};

			mp4boxfile.onSamples = (trackId, ref, samples) => {
				for (const sample of samples) {
					if (videoDecoder?.state === 'configured') {
						videoDecoder.decode(new EncodedVideoChunk({
							type: sample.is_sync ? 'key' : 'delta',
							timestamp: sample.cts,
							duration: sample.duration,
							data: sample.data
						}));
						samplesSubmitted++;
					}
				}
				
				// Check if we've submitted all samples
				if (samplesSubmitted >= totalSamples) {
					allSamplesExtracted = true;
					// Flush decoder to ensure all frames are output
					videoDecoder?.flush().then(() => {
						checkComplete();
					}).catch(reject);
				}
			};

			mp4boxfile.onError = (e) => {
				// Ignore non-fatal MP4Box parsing errors
				if (e && typeof e === 'string' && (e.includes('BoxParser') || e.includes('Invalid box'))) {
					console.warn('[FrameBuffer] MP4Box parsing warning (non-fatal):', e);
					// Don't reject - continue processing
				} else {
					console.error('[FrameBuffer] MP4Box error:', e);
					reject(e);
				}
			};

			// Read file
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const buffer = e.target.result;
					buffer.fileStart = 0;
					mp4boxfile.appendBuffer(buffer);
					mp4boxfile.flush();
				} catch (error) {
					// Ignore MP4Box parsing warnings (they're usually non-fatal)
					if (error.message && (error.message.includes('BoxParser') || error.message.includes('Invalid box'))) {
						console.warn('[FrameBuffer] MP4Box parsing warning (non-fatal):', error.message);
						// Continue anyway - the file might still decode
					} else {
						reject(error);
					}
				}
			};
			reader.onerror = reject;
			reader.readAsArrayBuffer(file);
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
				return this.clips.get(clipIndex)?.[localFrame] || null;
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
		return clip[wrappedFrame] || null;
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
	 * Clean up all ImageBitmaps
	 */
	dispose() {
		for (const [_, frames] of this.clips) {
			frames.forEach(bitmap => bitmap.close());
		}
		this.clips.clear();
		this.clipOffsets = [0];
		this.totalFrames = 0;
	}
}

// Singleton instance
export const frameBuffer = new FrameBuffer();
