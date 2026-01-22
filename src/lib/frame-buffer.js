/**
 * Frame Buffer - Pre-decodes video frames into a sliding window around playback
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

function makeFrameKey(clipIndex, localFrame) {
	return `${clipIndex}:${localFrame}`;
}

export class FrameBuffer {
	constructor({ prefetchSeconds = 2, maxFrames = null, targetFps = 24 } = {}) {
		/** @type {Map<number, { file: File, url: string, video: HTMLVideoElement, frameCount: number, outputWidth: number, outputHeight: number, duration: number, decodeQueue: Promise<void> }>} */
		this.clips = new Map();
		
		/** @type {number[]} - cumulative frame counts for global indexing */
		this.clipOffsets = [0];
		
		/** @type {Map<string, { clipIndex: number, localFrame: number, bitmap: ImageBitmap }>} */
		this.frameCache = new Map();
		
		/** @type {Map<string, Promise<ImageBitmap | null>>} */
		this.pendingDecodes = new Map();
		
		this.totalFrames = 0;
		this.isLoading = false;
		this.loadProgress = 0;
		
		this.prefetchSeconds = prefetchSeconds;
		this.maxFrames = maxFrames;
		this.targetFps = targetFps;
		
		// Output dimensions (will be set per video based on native resolution)
		this.outputWidth = 1920;
		this.outputHeight = 1080;
		
		// Reusable canvas for frame conversion (will be resized per video)
		this.canvas = document.createElement('canvas');
		this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
	}

	get maxCacheFrames() {
		const derivedMax = Math.ceil(this.prefetchSeconds * this.targetFps);
		return Math.max(1, this.maxFrames ?? derivedMax);
	}

	get prefetchRadius() {
		return Math.max(1, Math.floor(this.maxCacheFrames / 2));
	}

	/**
	 * Prepare video files for on-demand decoding
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
			console.log(`Clip ${i} indexed: ${clip.frameCount} frames`);
		}

		this.isLoading = false;
		onProgress(1, `Ready - ${this.totalFrames} frames indexed`);
		console.log(`All clips indexed. Total: ${this.totalFrames} frames across ${files.length} clips`);
	}

	/**
	 * Read video metadata without decoding frames
	 * @param {File} file
	 * @param {(progress: number) => void} onProgress
	 * @returns {Promise<{ file: File, url: string, video: HTMLVideoElement, frameCount: number, outputWidth: number, outputHeight: number, duration: number, decodeQueue: Promise<void> }>}
	 */
	async loadClipMetadata(file, onProgress = () => {}) {
		const url = URL.createObjectURL(file);
		const video = document.createElement('video');
		video.preload = 'auto';
		video.muted = true;
		video.playsInline = true;
		video.src = url;
		video.load();

		const videoReadyPromise = new Promise((resolve, reject) => {
			video.addEventListener('loadedmetadata', () => {
				resolve({
					duration: video.duration || 0,
					videoWidth: video.videoWidth || 0,
					videoHeight: video.videoHeight || 0
				});
			}, { once: true });
			video.addEventListener('error', () => reject(new Error('Failed to load video metadata')), { once: true });
		});

		let mp4Info = null;
		const isMp4 = file.type === 'video/mp4' || file.name.toLowerCase().endsWith('.mp4');
		if (isMp4) {
			try {
				mp4Info = await new Promise((resolve, reject) => {
					const mp4boxfile = MP4Box.createFile();

					mp4boxfile.onReady = (info) => {
						const videoTrack = info.tracks.find(t => t.type === 'video');
						if (!videoTrack) {
							reject(new Error('No video track found'));
							return;
						}

						const totalSamples = videoTrack.nb_samples;
						const nativeWidth = videoTrack.video.width;
						const nativeHeight = videoTrack.video.height;

						const outputSize = calculateOutputSize(nativeWidth, nativeHeight);

						resolve({
							totalSamples,
							outputWidth: outputSize.width,
							outputHeight: outputSize.height
						});
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

					const reader = new FileReader();
					reader.onload = (e) => {
						try {
							const buffer = e.target.result;
							buffer.fileStart = 0;
							mp4boxfile.appendBuffer(buffer);
							mp4boxfile.flush();
							onProgress(1);
						} catch (error) {
							if (error.message && (error.message.includes('BoxParser') || error.message.includes('Invalid box'))) {
								console.warn('[FrameBuffer] MP4Box parsing warning (non-fatal):', error.message);
							} else {
								reject(error);
							}
						}
					};
					reader.onerror = reject;
					reader.readAsArrayBuffer(file);
				});
			} catch (error) {
				console.warn('[FrameBuffer] Falling back to metadata-only frame count:', error);
				mp4Info = null;
			}
		}

		const videoInfo = await videoReadyPromise;
		const outputSize = mp4Info
			? { width: mp4Info.outputWidth, height: mp4Info.outputHeight }
			: calculateOutputSize(videoInfo.videoWidth || 1920, videoInfo.videoHeight || 1080);
		const frameCount = mp4Info?.totalSamples ?? Math.max(1, Math.round(videoInfo.duration * this.targetFps));

		return {
			file,
			url,
			video,
			frameCount,
			outputWidth: outputSize.width,
			outputHeight: outputSize.height,
			duration: videoInfo.duration,
			decodeQueue: Promise.resolve()
		};
	}

	/**
	 * Decode a single frame for a clip on demand
	 * @param {number} clipIndex
	 * @param {number} localFrame
	 * @returns {Promise<ImageBitmap | null>}
	 */
	async decodeFrameAt(clipIndex, localFrame) {
		const clip = this.clips.get(clipIndex);
		if (!clip) return null;

		const wrappedFrame = ((localFrame % clip.frameCount) + clip.frameCount) % clip.frameCount;
		const key = makeFrameKey(clipIndex, wrappedFrame);
		const cached = this.frameCache.get(key);
		if (cached) {
			this.touchFrame(key, cached);
			return cached.bitmap;
		}

		const pending = this.pendingDecodes.get(key);
		if (pending) return pending;

		const decodePromise = clip.decodeQueue
			.then(async () => {
				const existing = this.frameCache.get(key);
				if (existing) {
					this.touchFrame(key, existing);
					return existing.bitmap;
				}

				const frameTime = this.frameToTime(clip, wrappedFrame);
				await this.seekVideoToTime(clip.video, frameTime);

				this.canvas.width = clip.outputWidth;
				this.canvas.height = clip.outputHeight;
				this.ctx.clearRect(0, 0, clip.outputWidth, clip.outputHeight);
				this.ctx.drawImage(clip.video, 0, 0, clip.outputWidth, clip.outputHeight);

				const bitmap = await createImageBitmap(this.canvas);
				this.storeFrame(key, clipIndex, wrappedFrame, bitmap);
				return bitmap;
			})
			.catch((error) => {
				console.error(`[FrameBuffer] Failed to decode frame ${wrappedFrame} for clip ${clipIndex}:`, error);
				return null;
			})
			.finally(() => {
				this.pendingDecodes.delete(key);
			});

		clip.decodeQueue = decodePromise.then(() => undefined).catch(() => undefined);
		this.pendingDecodes.set(key, decodePromise);

		return decodePromise;
	}

	frameToTime(clip, localFrame) {
		if (!clip.duration || clip.duration <= 0) {
			return localFrame / this.targetFps;
		}

		const estimatedTime = localFrame / this.targetFps;
		const maxTime = Math.max(0, clip.duration - 1 / this.targetFps);
		return Math.min(estimatedTime, maxTime);
	}

	seekVideoToTime(video, time) {
		return new Promise((resolve, reject) => {
			if (!Number.isFinite(time)) {
				reject(new Error('Invalid seek time'));
				return;
			}

			const currentDelta = Math.abs(video.currentTime - time);
			if (currentDelta < 0.0001 && video.readyState >= 2) {
				if (typeof video.requestVideoFrameCallback === 'function') {
					video.requestVideoFrameCallback(() => resolve());
				} else {
					requestAnimationFrame(() => resolve());
				}
				return;
			}

			const onSeeked = () => {
				if (typeof video.requestVideoFrameCallback === 'function') {
					video.requestVideoFrameCallback(() => resolve());
				} else {
					requestAnimationFrame(() => resolve());
				}
			};

			const onError = () => reject(new Error('Video seek failed'));

			video.addEventListener('seeked', onSeeked, { once: true });
			video.addEventListener('error', onError, { once: true });
			video.currentTime = time;
		});
	}

	storeFrame(key, clipIndex, localFrame, bitmap) {
		this.frameCache.delete(key);
		this.frameCache.set(key, { clipIndex, localFrame, bitmap });
		this.evictIfNeeded();
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
			if (entry?.bitmap) {
				entry.bitmap.close();
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

		const radius = this.prefetchRadius;
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
	 * Get frame by global index (across all clips)
	 * @param {number} globalIndex
	 * @returns {ImageBitmap | null}
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
			this.outputWidth = clip.outputWidth;
			this.outputHeight = clip.outputHeight;
			return cached.bitmap;
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

		const wrappedFrame = ((localFrame % clip.frameCount) + clip.frameCount) % clip.frameCount;
		const key = makeFrameKey(clipIndex, wrappedFrame);
		const cached = this.frameCache.get(key);
		if (cached) {
			this.touchFrame(key, cached);
			this.outputWidth = clip.outputWidth;
			this.outputHeight = clip.outputHeight;
			return cached.bitmap;
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
	 * Clean up all ImageBitmaps and videos
	 */
	dispose() {
		for (const entry of this.frameCache.values()) {
			entry.bitmap.close();
		}
		this.frameCache.clear();
		this.pendingDecodes.clear();

		for (const clip of this.clips.values()) {
			if (clip.video) {
				clip.video.pause();
				clip.video.removeAttribute('src');
				clip.video.load();
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
export const frameBuffer = new FrameBuffer();
