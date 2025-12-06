/**
 * Frame Buffer - Pre-decodes all video clips into ImageBitmap arrays for instant access
 * Enables seamless retiming, speed ramps, jump cuts, and reverse playback
 */
import * as MP4Box from 'mp4box';

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;

export class FrameBuffer {
	constructor() {
		/** @type {Map<number, ImageBitmap[]>} */
		this.clips = new Map();
		
		/** @type {number[]} - cumulative frame counts for global indexing */
		this.clipOffsets = [0];
		
		this.totalFrames = 0;
		this.isLoading = false;
		this.loadProgress = 0;
		
		// Reusable canvas for frame conversion
		this.canvas = document.createElement('canvas');
		this.canvas.width = OUTPUT_WIDTH;
		this.canvas.height = OUTPUT_HEIGHT;
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
			
			const mp4boxfile = MP4Box.createFile();
			let videoDecoder = null;

			const checkComplete = () => {
				if (allSamplesExtracted && frameMap.size >= totalSamples) {
					// Convert Map to ordered array
					const frames = [];
					for (let i = 0; i < totalSamples; i++) {
						frames.push(frameMap.get(i) || null);
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
				console.log(`Video has ${totalSamples} samples`);

				const config = {
					codec: videoTrack.codec,
					codedWidth: videoTrack.video.width,
					codedHeight: videoTrack.video.height,
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
						this.ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
						this.ctx.drawImage(frame, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
						
						// Use sync canvas copy instead of async createImageBitmap
						const imageData = this.ctx.getImageData(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
						createImageBitmap(imageData).then(bitmap => {
							// Store frame at correct index to maintain order
							frameMap.set(currentFrameIndex, bitmap);
							onProgress(frameMap.size / totalSamples);
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

			mp4boxfile.onError = (e) => reject(e);

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
