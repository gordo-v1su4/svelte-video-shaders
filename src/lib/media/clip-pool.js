/**
 * ClipPool - FreeCut-style on-demand video frame extraction built on mediabunny.
 *
 * Replaces the old WebCodecsFrameBuffer which pre-decoded EVERY frame of EVERY
 * clip into RAM as ImageBitmaps (slow loads, unbounded memory). Instead:
 *
 * - Loading a clip only reads container metadata (near-instant).
 * - Frames are decoded on demand through a mediabunny CanvasSink, which uses
 *   hardware WebCodecs decoding under the hood and handles keyframe seeking.
 * - A per-clip sequential reader chases the playhead with a small lookahead
 *   window, so beat-synced clip swaps and scrubbing stay smooth.
 * - Decoded frames live in a bounded LRU cache of ImageBitmaps; memory stays
 *   flat regardless of clip count or length.
 *
 * The public API is compatible with what ShaderPlayer expects:
 *   totalFrames, getFrame(globalIndex), getClipInfo(i), globalToLocal(i),
 *   primeAroundFrame(globalIndex), dispose()
 */

import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';

const DEFAULT_FPS = 24;
/** Frames decoded ahead of the most recently requested frame. */
const LOOKAHEAD_FRAMES = 36;
/** Frames kept behind the playhead before eviction. */
const KEEP_BEHIND_FRAMES = 12;
/** Hard cap of cached frames per clip. */
const MAX_CACHE_PER_CLIP = 160;
/** If a request lands this far outside the reader position, restart the reader. */
const READER_RESTART_GAP = 18;

class ClipReader {
	/**
	 * @param {import('mediabunny').CanvasSink} sink
	 * @param {ClipEntry} entry
	 */
	constructor(sink, entry) {
		this.sink = sink;
		this.entry = entry;
		this.iterator = null;
		/** Local frame index the reader will decode next. */
		this.position = -1;
		this.running = false;
		this.generation = 0;
	}

	/** Ensure frames [target, target+lookahead] end up in the cache. */
	request(targetFrame) {
		const clamped = Math.max(0, Math.min(this.entry.frameCount - 1, targetFrame));
		this.targetFrame = clamped;
		if (!this.running) {
			this.running = true;
			this.#run().catch((err) => {
				console.warn('[ClipPool] reader loop error:', err);
				this.running = false;
			});
		}
	}

	async #restartAt(frame) {
		this.generation += 1;
		const gen = this.generation;
		if (this.iterator) {
			try {
				await this.iterator.return?.();
			} catch {
				/* ignore */
			}
		}
		if (gen !== this.generation) return;
		const startTime = frame / this.entry.fps + this.entry.firstTimestamp;
		this.iterator = this.sink.canvases(Math.max(this.entry.firstTimestamp, startTime));
		this.position = frame;
	}

	async #run() {
		const entry = this.entry;
		while (true) {
			const target = this.targetFrame;
			const wantEnd = Math.min(entry.frameCount - 1, target + LOOKAHEAD_FRAMES);

			// Determine if we need a restart (backwards seek or big forward jump)
			if (
				this.iterator === null ||
				this.position > target + 1 ||
				target - this.position > READER_RESTART_GAP + LOOKAHEAD_FRAMES
			) {
				await this.#restartAt(target);
			}

			if (this.position > wantEnd) {
				// Fully caught up
				this.running = false;
				return;
			}

			const gen = this.generation;
			let result;
			try {
				result = await this.iterator.next();
			} catch (err) {
				console.warn('[ClipPool] decode error, restarting reader:', err);
				await this.#restartAt(this.targetFrame);
				continue;
			}
			if (gen !== this.generation) continue; // Restarted while awaiting
			if (result.done) {
				this.running = false;
				return;
			}

			const wrapped = result.value;
			const frameIdx = Math.max(
				0,
				Math.min(
					entry.frameCount - 1,
					Math.round((wrapped.timestamp - entry.firstTimestamp) * entry.fps)
				)
			);

			// Skip frames that are far behind what we need (fast-forward decode)
			if (frameIdx >= this.targetFrame - KEEP_BEHIND_FRAMES || frameIdx === this.position) {
				if (!entry.cache.has(frameIdx)) {
					try {
						const bitmap = await createImageBitmap(wrapped.canvas);
						if (gen === this.generation) {
							entry.putFrame(frameIdx, bitmap);
						} else {
							bitmap.close();
						}
					} catch (err) {
						console.warn('[ClipPool] createImageBitmap failed:', err);
					}
				}
			}
			this.position = frameIdx + 1;
		}
	}

	async dispose() {
		this.generation += 1;
		if (this.iterator) {
			try {
				await this.iterator.return?.();
			} catch {
				/* ignore */
			}
			this.iterator = null;
		}
		this.running = false;
	}
}

class ClipEntry {
	constructor({ file, input, sink, frameCount, fps, firstTimestamp, width, height }) {
		this.file = file;
		this.input = input;
		this.sink = sink;
		this.frameCount = frameCount;
		this.fps = fps;
		this.firstTimestamp = firstTimestamp;
		this.width = width;
		this.height = height;
		/** @type {Map<number, ImageBitmap>} insertion-ordered LRU */
		this.cache = new Map();
		this.reader = new ClipReader(sink, this);
		this.lastRequestedFrame = 0;
	}

	putFrame(frameIdx, bitmap) {
		if (this.cache.has(frameIdx)) {
			bitmap.close();
			return;
		}
		this.cache.set(frameIdx, bitmap);
		this.#evict();
	}

	#evict() {
		if (this.cache.size <= MAX_CACHE_PER_CLIP) return;
		const playhead = this.lastRequestedFrame;
		// Evict frames far from the playhead first (behind it, or far ahead)
		for (const [idx, bmp] of this.cache) {
			if (this.cache.size <= MAX_CACHE_PER_CLIP) break;
			if (idx < playhead - KEEP_BEHIND_FRAMES || idx > playhead + LOOKAHEAD_FRAMES * 2) {
				bmp.close();
				this.cache.delete(idx);
			}
		}
		// Still over cap (dense window) - drop oldest inserted
		while (this.cache.size > MAX_CACHE_PER_CLIP) {
			const [idx, bmp] = this.cache.entries().next().value;
			bmp.close();
			this.cache.delete(idx);
		}
	}

	/** Best-effort synchronous frame fetch: exact frame, else nearest cached. */
	getFrameSync(frameIdx) {
		const exact = this.cache.get(frameIdx);
		if (exact) return exact;
		// Nearest earlier frame within a short window avoids flashing black
		for (let d = 1; d <= 8; d++) {
			const before = this.cache.get(frameIdx - d);
			if (before) return before;
			const after = this.cache.get(frameIdx + d);
			if (after) return after;
		}
		return null;
	}

	async dispose() {
		await this.reader.dispose();
		for (const bmp of this.cache.values()) bmp.close();
		this.cache.clear();
		try {
			// Input has no explicit dispose in all versions; source may hold a blob ref only.
			this.input = null;
		} catch {
			/* ignore */
		}
	}
}

export class ClipPool {
	constructor({ targetFps = DEFAULT_FPS, width = 1280, height = 720 } = {}) {
		this.targetFps = targetFps;
		this.targetAspect = 16 / 9;
		/** @type {ClipEntry[]} */
		this.entries = [];
		/** @type {number[]} cumulative frame offsets */
		this.clipOffsets = [0];
		this.totalFrames = 0;
		this.isLoading = false;
		this.outputWidth = width;
		this.outputHeight = height;
	}

	get clips() {
		// Legacy shim: `.clips.size` was used for logging
		return { size: this.entries.length };
	}

	/**
	 * Load metadata for all files and prime first frames. Near-instant compared
	 * to the old full pre-decode.
	 * @param {File[]} files
	 * @param {(progress: number, status: string) => void} onProgress
	 */
	async loadClips(files, onProgress = () => {}) {
		this.isLoading = true;
		await this.dispose();
		this.entries = [];
		this.clipOffsets = [0];
		this.totalFrames = 0;

		const failedIndices = [];
		const loadedIndices = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			onProgress(i / files.length, `Reading ${file.name}...`);
			try {
				const entry = await this.#openClip(file);
				this.entries.push(entry);
				this.totalFrames += entry.frameCount;
				this.clipOffsets.push(this.totalFrames);
				loadedIndices.push(i);
			} catch (err) {
				console.error(`[ClipPool] Failed to open ${file.name}:`, err);
				failedIndices.push(i);
			}
		}

		this.isLoading = false;
		onProgress(1, `Ready - ${this.entries.length} clips, ${this.totalFrames} frames`);

		// Prime the first frame of every clip so swaps have imagery immediately
		for (let i = 0; i < this.entries.length; i++) {
			this.entries[i].reader.request(0);
		}

		return {
			successCount: this.entries.length,
			failedIndices,
			loadedIndices
		};
	}

	async #openClip(file) {
		const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error('No video track found');
		const decodable = await videoTrack.canDecode();
		if (!decodable) throw new Error('Video track cannot be decoded in this browser');

		const duration = await input.computeDuration();
		const firstTimestamp = await videoTrack.getFirstTimestamp();
		const fps = this.targetFps;
		const frameCount = Math.max(1, Math.round((duration - firstTimestamp) * fps));

		// All clips normalize to the same 16:9 output size (cover = center crop)
		// so the WebGL texture never changes dimensions across clip swaps.
		const outW = this.outputWidth;
		const outH = this.outputHeight;

		const sink = new CanvasSink(videoTrack, {
			width: outW,
			height: outH,
			fit: 'cover',
			poolSize: 3
		});

		return new ClipEntry({
			file,
			input,
			sink,
			frameCount,
			fps,
			firstTimestamp,
			width: outW,
			height: outH
		});
	}

	/**
	 * Synchronous frame fetch for the render loop. Returns the cached bitmap
	 * (or nearest neighbor) and kicks the reader to decode ahead.
	 * @param {number} globalIndex
	 * @returns {ImageBitmap | null}
	 */
	getFrame(globalIndex) {
		if (this.totalFrames === 0) return null;
		const loc = this.globalToLocal(globalIndex);
		if (!loc) return null;
		return this.getFrameAt(loc.clipIndex, loc.localFrame);
	}

	/**
	 * @param {number} clipIndex
	 * @param {number} localFrame
	 * @returns {ImageBitmap | null}
	 */
	getFrameAt(clipIndex, localFrame) {
		const entry = this.entries[clipIndex];
		if (!entry) return null;
		const wrapped = ((localFrame % entry.frameCount) + entry.frameCount) % entry.frameCount;
		entry.lastRequestedFrame = wrapped;
		entry.reader.request(wrapped);
		return entry.getFrameSync(wrapped);
	}

	/** Prewarm decode around a global frame (e.g. upcoming beat-swap point). */
	primeAroundFrame(globalFrame) {
		const loc = this.globalToLocal(globalFrame);
		if (!loc) return;
		const entry = this.entries[loc.clipIndex];
		entry?.reader.request(loc.localFrame);
	}

	/** Prewarm a specific clip at a local frame (upcoming swap targets). */
	primeClip(clipIndex, localFrame = 0) {
		const entry = this.entries[clipIndex];
		if (!entry) return;
		const wrapped = ((localFrame % entry.frameCount) + entry.frameCount) % entry.frameCount;
		entry.reader.request(wrapped);
	}

	async ensureFirstFrameReady(clipIndex = 0) {
		const entry = this.entries[clipIndex];
		if (!entry) return null;
		entry.reader.request(0);
		// Wait briefly for the first frame to land in cache
		for (let i = 0; i < 100; i++) {
			const frame = entry.cache.get(0);
			if (frame) return frame;
			await new Promise((r) => setTimeout(r, 20));
		}
		return null;
	}

	getClipInfo(clipIndex) {
		const entry = this.entries[clipIndex];
		if (!entry) return null;
		return {
			frameCount: entry.frameCount,
			startFrame: this.clipOffsets[clipIndex],
			endFrame: this.clipOffsets[clipIndex + 1] - 1,
			fps: entry.fps,
			width: entry.width,
			height: entry.height,
			name: entry.file?.name
		};
	}

	globalToLocal(globalIndex) {
		if (this.totalFrames === 0) return null;
		const wrapped = ((globalIndex % this.totalFrames) + this.totalFrames) % this.totalFrames;
		for (let clipIndex = 0; clipIndex < this.entries.length; clipIndex++) {
			const start = this.clipOffsets[clipIndex];
			const end = this.clipOffsets[clipIndex + 1];
			if (wrapped >= start && wrapped < end) {
				return { clipIndex, localFrame: wrapped - start };
			}
		}
		return null;
	}

	async dispose() {
		for (const entry of this.entries) {
			await entry.dispose();
		}
		this.entries = [];
		this.clipOffsets = [0];
		this.totalFrames = 0;
	}
}

// Singleton used by the workbench + player
export const clipPool = new ClipPool();
