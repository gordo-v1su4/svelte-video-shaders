/**
 * Playback engine - pure, testable logic extracted from the old monolithic
 * VideoWorkbench: master clock, marker filtering, speed-ramp curve
 * preprocessing, beat trigger scheduling, and section post-processing.
 */

export const TARGET_FPS = 24;

/** Deterministic seeded random (used for random skip + export determinism). */
export function seededRandom(seed) {
	const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
}

/**
 * Density/random-skip filter for beat markers (Essentia onsets or MIDI notes).
 * Density 1 keeps everything; lower values enforce a minimum musical interval.
 */
export function filterMarkersByDensity(
	markers,
	{
		density = 1,
		bpm = 120,
		randomSkip = false,
		skipChance = 0.3,
		seedOffset = 0,
		maxDuration = 0
	} = {}
) {
	if (!markers || markers.length === 0) return [];

	let result = markers
		.map((t) => (typeof t === 'number' ? t : parseFloat(t)))
		.filter((t) => !isNaN(t) && t >= 0)
		.filter((t) => !maxDuration || t <= maxDuration);

	if (density < 1.0) {
		const secondsPerBeat = 60 / (bpm > 0 ? bpm : 120);
		const interval32 = secondsPerBeat / 8;
		const scaler = 1 + (1 - density) * 31;
		const effectiveMinInterval = interval32 * scaler;

		const filtered = [];
		let lastTime = -effectiveMinInterval;
		for (const marker of result) {
			if (marker - lastTime >= effectiveMinInterval) {
				filtered.push(marker);
				lastTime = marker;
			}
		}
		result = filtered;
	}

	if (randomSkip && skipChance > 0) {
		result = result.filter((_, i) => seededRandom(i + seedOffset) > skipChance);
	}

	return result;
}

/** 1/32-note grid markers aligned to the first detected beat. */
export function computeGridMarkers({ bpm = 120, duration = 0, beats = [] } = {}) {
	if (!duration || duration <= 0) return [];
	const secondsPerBeat = 60 / (bpm > 0 ? bpm : 120);
	const interval32 = secondsPerBeat / 8;
	const startOffset = beats && beats.length > 0 ? beats[0] : 0;

	const markers = [];
	for (let t = startOffset - interval32; t >= 0; t -= interval32) markers.unshift(t);
	for (let t = startOffset; t < duration; t += interval32) markers.push(t);
	return markers;
}

/**
 * Pre-process an energy curve into speed + cumulative time-remap curves.
 * Returns null when no curve is available.
 */
export function preprocessSpeedCurve(
	energyCurve,
	{ duration = 0, minSpeed = 0.8, maxSpeed = 1.8, smoothing = 0.15, punch = 1.4 } = {}
) {
	if (!energyCurve || energyCurve.length === 0) return null;

	const N = energyCurve.length;
	let sum = 0;
	for (let i = 0; i < N; i++) sum += energyCurve[i];
	const mean = sum / N;

	let sqDiffSum = 0;
	for (let i = 0; i < N; i++) {
		const diff = energyCurve[i] - mean;
		sqDiffSum += diff * diff;
	}
	const std = Math.sqrt(sqDiffSum / N) || 1;

	const totalDuration = duration > 0 ? duration : N * (512 / 44100);
	const dt = totalDuration / Math.max(1, N - 1);

	const normalized = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		const z = (energyCurve[i] - mean) / (std || 1e-9);
		normalized[i] = Math.max(0, Math.min(1, (z + 2) / 4));
	}

	const smoothed = new Float32Array(N);
	if (smoothing > 0) {
		smoothed[0] = normalized[0];
		for (let i = 1; i < N; i++) {
			smoothed[i] = smoothing * normalized[i] + (1 - smoothing) * smoothed[i - 1];
		}
	} else {
		smoothed.set(normalized);
	}

	const speeds = new Float32Array(N);
	const speedRange = maxSpeed - minSpeed;
	for (let i = 0; i < N; i++) {
		speeds[i] = minSpeed + speedRange * Math.pow(smoothed[i], punch);
	}

	const timeRemap = new Float32Array(N);
	timeRemap[0] = 0;
	for (let i = 1; i < N; i++) {
		timeRemap[i] = timeRemap[i - 1] + (speeds[i - 1] + speeds[i]) * 0.5 * dt;
	}

	return { speeds, timeRemap, timestep: dt };
}

/** Look up remapped time + speed at a wall-clock audio time. */
export function sampleSpeedCurve(curve, audioTime) {
	if (!curve) return { speed: 1, remappedTime: audioTime };
	const idx = Math.max(
		0,
		Math.min(curve.speeds.length - 1, Math.floor(audioTime / curve.timestep))
	);
	return { speed: curve.speeds[idx], remappedTime: curve.timeRemap[idx] };
}

/**
 * Walks a sorted trigger list as time advances and reports marker hits.
 * Side-effect free: callers decide what a hit does (clip swap, FX spike...).
 */
export class TriggerScheduler {
	constructor() {
		this.previousTime = 0;
		this.nextMarkerIndex = 0;
		this.triggerCount = 0;
	}

	static findNextIndex(triggers, time) {
		const nextIndex = triggers.findIndex((marker) => marker > time);
		return nextIndex === -1 ? triggers.length : nextIndex;
	}

	reset(triggers, time) {
		this.previousTime = time;
		this.nextMarkerIndex = TriggerScheduler.findNextIndex(triggers, time);
	}

	/**
	 * Advance to `time`; returns array of marker times crossed since last call.
	 * Detects seeks/pauses (backwards jumps or gaps > 1s) and resets silently.
	 */
	advance(triggers, time, { isPlaying = true } = {}) {
		if (!isPlaying || time < this.previousTime || Math.abs(time - this.previousTime) > 1.0) {
			this.reset(triggers, time);
			return [];
		}

		const hits = [];
		if (time > this.previousTime) {
			while (this.nextMarkerIndex < triggers.length) {
				const marker = triggers[this.nextMarkerIndex];
				if (marker > time) break;
				if (marker > this.previousTime) hits.push(marker);
				this.nextMarkerIndex++;
			}
		}
		this.previousTime = time;
		return hits;
	}
}

/**
 * Master clock - audio element is ground truth (FreeCut Clock pattern).
 * Runs a rAF loop while playing and invokes onTick(currentTime, deltaTime).
 */
export class Clock {
	/**
	 * @param {{ getTime: () => number, isRunning: () => boolean, onTick: (time: number, dt: number) => void }} options
	 */
	constructor({ getTime, isRunning, onTick }) {
		this.getTime = getTime;
		this.isRunning = isRunning;
		this.onTick = onTick;
		this.rafId = 0;
		this.lastTime = 0;
		this.active = false;
	}

	start() {
		if (this.active) return;
		this.active = true;
		this.lastTime = this.getTime();
		const loop = () => {
			if (!this.active) return;
			if (this.isRunning()) {
				const time = this.getTime();
				const dt = time - this.lastTime;
				this.lastTime = time;
				this.onTick(time, dt);
			}
			this.rafId = requestAnimationFrame(loop);
		};
		this.rafId = requestAnimationFrame(loop);
	}

	stop() {
		this.active = false;
		cancelAnimationFrame(this.rafId);
	}
}

/** Rebuild sorted unique boundary list from section rows. */
export function rebuildSectionBoundaries(sections) {
	const cuts = [];
	for (const section of sections) cuts.push(section.start, section.end);
	return Array.from(new Set(cuts)).sort((a, b) => a - b);
}

/**
 * Post-process structure sections from the analysis API; falls back to a
 * synthesized intro/verse/chorus/outro layout when detection is unusable.
 */
export function postProcessSections(structure, duration) {
	if (!structure || !structure.sections || !duration) {
		return { sections: [], boundaries: [] };
	}

	const sections = structure.sections;
	const hasValidSections = sections.some((s) => s.duration > 5 && s.end > s.start && s.start >= 0);

	if (hasValidSections) {
		const validSections = sections.filter((s) => s.duration > 1 && s.end > s.start && s.start >= 0);
		if (validSections.length > 0) {
			return {
				sections: validSections,
				boundaries: validSections
					.map((s) => s.start)
					.concat([validSections[validSections.length - 1].end])
			};
		}
	}

	// Fallback: synthesized sections from typical song structure
	const fallbackSections = [];
	const boundaries = [0];

	const introEnd = Math.min(duration * 0.1, 15);
	if (introEnd > 5) {
		fallbackSections.push({
			start: 0,
			end: introEnd,
			label: 'intro',
			duration: introEnd,
			energy: 0
		});
		boundaries.push(introEnd);
	}

	const mainStart = introEnd > 5 ? introEnd : 0;
	const outroStart = duration - Math.min(duration * 0.15, 20);
	const mainDuration = outroStart - mainStart;

	if (mainDuration > 20) {
		const numParts = Math.max(1, Math.floor(mainDuration / 30));
		const partDuration = mainDuration / numParts;
		for (let i = 0; i < numParts; i++) {
			const start = mainStart + i * partDuration;
			const end = mainStart + (i + 1) * partDuration;
			fallbackSections.push({
				start,
				end,
				label: i % 2 === 0 ? 'verse' : 'chorus',
				duration: end - start,
				energy: 0
			});
			boundaries.push(end);
		}
	} else {
		fallbackSections.push({
			start: mainStart,
			end: outroStart,
			label: 'verse',
			duration: mainDuration,
			energy: 0
		});
		boundaries.push(outroStart);
	}

	if (duration - outroStart > 5) {
		fallbackSections.push({
			start: outroStart,
			end: duration,
			label: 'outro',
			duration: duration - outroStart,
			energy: 0
		});
		boundaries.push(duration);
	}

	return { sections: fallbackSections, boundaries };
}

/** Section lookup for a time (with index), defaulting to a whole-song row. */
export function sectionAtTime(sections, time, duration = 0) {
	if (!sections || sections.length === 0) {
		return { label: 'song', start: 0, end: duration || 0, index: 0 };
	}
	for (let i = 0; i < sections.length; i++) {
		if (time >= sections[i].start && time < sections[i].end) {
			return { ...sections[i], index: i };
		}
	}
	const last = sections[sections.length - 1];
	return { ...last, index: sections.length - 1 };
}

export function formatTime(seconds) {
	const safe = Math.max(0, seconds || 0);
	const mins = Math.floor(safe / 60);
	const secs = Math.floor(safe % 60);
	return `${mins}:${secs.toString().padStart(2, '0')}`;
}
