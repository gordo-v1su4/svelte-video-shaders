/** Avoid exact duration seek — H.264 can stall at EOF. */
export function safeMediaTime(duration, time) {
	if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, time);
	return Math.max(0, Math.min(time, duration - 0.001));
}

export function safeVideoElementSeekTime(video, time) {
	return safeMediaTime(video.duration, time);
}

/**
 * Assign currentTime only when delta exceeds tolerance and element is not mid-seek.
 * Prevents decoder thrash from assigning every display frame.
 */
export function applyVideoSeekIfNeeded(video, targetSec, opts = {}) {
	const threshold = opts.threshold ?? 0.022;
	if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return false;
	if (video.seeking) return false;
	const t = safeVideoElementSeekTime(video, targetSec);
	if (!Number.isFinite(t)) return false;
	if (Math.abs(video.currentTime - t) <= threshold) return false;
	try {
		video.currentTime = t;
		return true;
	} catch {
		return false;
	}
}

export function waitFirstPresentedFrame(video, timeoutMs = 800) {
	return new Promise((resolve) => {
		let finished = false;
		const finish = () => {
			if (finished) return;
			finished = true;
			resolve();
		};
		const timer = window.setTimeout(finish, timeoutMs);
		if (typeof video.requestVideoFrameCallback === 'function') {
			video.requestVideoFrameCallback(() => {
				window.clearTimeout(timer);
				finish();
			});
		} else {
			requestAnimationFrame(() => {
				window.clearTimeout(timer);
				finish();
			});
		}
	});
}

/** Prime decoder/GPU surface so texture upload is not black on first frame. */
export async function primeVideoElement(video) {
	try {
		await video.play();
	} catch (err) {
		console.warn('[VideoSource] play() during GPU prime:', err);
	}
	await waitFirstPresentedFrame(video, 800);
	try {
		video.pause();
	} catch {
		/* ignore */
	}
}
