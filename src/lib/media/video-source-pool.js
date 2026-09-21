/**
 * Live playback pool — hidden HTMLVideoElement per clip (webgpu-video-looper /
 * FreeCut VideoSourcePool pattern). Browser-native decode + buffering; no
 * per-frame async ImageBitmap extraction during playback.
 *
 * mediabunny ClipPool remains for offline export only.
 */

import {
	applyVideoSeekIfNeeded,
	primeVideoElement,
	safeMediaTime
} from './html-video-seek.js';

const DEFAULT_FPS = 24;

class VideoSourceEntry {
	/** @param {File} file */
	constructor(file) {
		this.file = file;
		this.url = URL.createObjectURL(file);
		this.video = document.createElement('video');
		this.video.muted = true;
		this.video.playsInline = true;
		this.video.setAttribute('playsinline', '');
		this.video.preload = 'auto';
		this.video.loop = false;
		this.video.src = this.url;
		this.video.style.cssText =
			'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:0';
		document.body.appendChild(this.video);
		this.duration = 0;
		this.frameCount = 0;
		this.fps = DEFAULT_FPS;
		this.width = 0;
		this.height = 0;
		this.ready = false;
	}

	async load(fps = DEFAULT_FPS) {
		this.fps = fps;
		await new Promise((resolve, reject) => {
			const onReady = () => {
				cleanup();
				resolve();
			};
			const onErr = () => {
				cleanup();
				reject(new Error(`Failed to load ${this.file.name}`));
			};
			const cleanup = () => {
				this.video.removeEventListener('loadedmetadata', onReady);
				this.video.removeEventListener('error', onErr);
			};
			this.video.addEventListener('loadedmetadata', onReady, { once: true });
			this.video.addEventListener('error', onErr, { once: true });
			this.video.load();
		});

		this.duration = this.video.duration || 0;
		this.frameCount = Math.max(1, Math.round(this.duration * fps));
		this.width = this.video.videoWidth || 1280;
		this.height = this.video.videoHeight || 720;
		await primeVideoElement(this.video);
		this.video.currentTime = 0;
		this.ready = true;
	}

	seekToTime(timeSec, threshold = 0.022) {
		if (!this.ready) return;
		const wrapped =
			this.duration > 0 ? safeMediaTime(this.duration, timeSec % this.duration) : Math.max(0, timeSec);
		applyVideoSeekIfNeeded(this.video, wrapped, { threshold });
	}

	dispose() {
		this.video.pause();
		this.video.removeAttribute('src');
		this.video.load();
		this.video.remove();
		URL.revokeObjectURL(this.url);
		this.ready = false;
	}
}

export class VideoSourcePool {
	constructor({ targetFps = DEFAULT_FPS } = {}) {
		this.targetFps = targetFps;
		/** @type {VideoSourceEntry[]} */
		this.entries = [];
		this.activeClipIndex = 0;
		this.isLoading = false;
		this.outputWidth = 1280;
		this.outputHeight = 720;
	}

	get totalFrames() {
		return this.entries.reduce((sum, e) => sum + e.frameCount, 0);
	}

	get clips() {
		return { size: this.entries.length };
	}

	/**
	 * @param {File[]} files
	 * @param {(progress: number, status: string) => void} onProgress
	 */
	async loadClips(files, onProgress = () => {}) {
		this.isLoading = true;
		await this.dispose();

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			onProgress((i + 0.5) / files.length, `Loading ${file.name}...`);
			try {
				const entry = new VideoSourceEntry(file);
				await entry.load(this.targetFps);
				this.entries.push(entry);
				if (entry.width && entry.height) {
					this.outputWidth = entry.width;
					this.outputHeight = entry.height;
				}
			} catch (err) {
				console.error(`[VideoSourcePool] Failed to load ${file.name}:`, err);
			}
		}

		this.activeClipIndex = 0;
		this.isLoading = false;
		onProgress(1, `Ready — ${this.entries.length} clips`);
		return { successCount: this.entries.length };
	}

	async ensureAllPrimed() {
		await Promise.all(
			this.entries.map(async (entry) => {
				if (!entry.ready) return;
				entry.seekToTime(0, 0);
				await primeVideoElement(entry.video);
				entry.video.currentTime = 0;
			})
		);
	}

	async ensureClipReady(clipIndex = 0) {
		const entry = this.entries[clipIndex];
		if (!entry?.ready) return false;
		entry.seekToTime(0, 0);
		for (let i = 0; i < 50; i++) {
			if (entry.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return true;
			await new Promise((r) => setTimeout(r, 20));
		}
		return entry.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
	}

	getActiveVideo() {
		return this.entries[this.activeClipIndex]?.video ?? null;
	}

	setActiveClip(clipIndex) {
		if (clipIndex < 0 || clipIndex >= this.entries.length) return;
		this.activeClipIndex = clipIndex;
	}

	seekActive(timeSec, threshold = 0.022) {
		const entry = this.entries[this.activeClipIndex];
		entry?.seekToTime(timeSec, threshold);
	}

	/** @param {number} clipIndex */
	getClipInfo(clipIndex) {
		const entry = this.entries[clipIndex];
		if (!entry) return null;
		let startFrame = 0;
		for (let i = 0; i < clipIndex; i++) startFrame += this.entries[i].frameCount;
		return {
			frameCount: entry.frameCount,
			startFrame,
			endFrame: startFrame + entry.frameCount - 1,
			fps: entry.fps,
			width: entry.width,
			height: entry.height,
			name: entry.file?.name,
			duration: entry.duration
		};
	}

	globalToLocal(globalIndex) {
		if (this.totalFrames === 0) return null;
		const wrapped = ((globalIndex % this.totalFrames) + this.totalFrames) % this.totalFrames;
		let offset = 0;
		for (let clipIndex = 0; clipIndex < this.entries.length; clipIndex++) {
			const count = this.entries[clipIndex].frameCount;
			if (wrapped >= offset && wrapped < offset + count) {
				return { clipIndex, localFrame: wrapped - offset };
			}
			offset += count;
		}
		return null;
	}

	primeClip(clipIndex, localFrame = 0) {
		const entry = this.entries[clipIndex];
		if (!entry) return;
		const timeSec = localFrame / entry.fps;
		entry.seekToTime(timeSec, 0.05);
	}

	primeAroundFrame(_globalFrame) {
		/* Native video buffering handles lookahead; no-op for API compat. */
	}

	getFrame(_globalIndex) {
		/* Legacy ClipPool API — live path uses getActiveVideo() instead. */
		return null;
	}

	async dispose() {
		for (const entry of this.entries) {
			entry.dispose();
		}
		this.entries = [];
		this.activeClipIndex = 0;
	}
}

export const videoSourcePool = new VideoSourcePool();
