const DEFAULT_ESSENTIA_HOP_SIZE = 512;
const DEFAULT_ESSENTIA_SAMPLE_RATE = 44100;
const DEFAULT_SECONDS_PER_FRAME = DEFAULT_ESSENTIA_HOP_SIZE / DEFAULT_ESSENTIA_SAMPLE_RATE;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/**
 * Build preprocessed speed and remap curves from raw energy values.
 * Returns null when input is empty or invalid.
 */
export function preprocessSpeedRampCurve({
	rawCurve,
	audioDuration = 0,
	minSpeed = 0.8,
	maxSpeed = 1.8,
	smoothing = 0.15,
	punch = 1.4,
	fallbackSecondsPerFrame = DEFAULT_SECONDS_PER_FRAME
}) {
	if (!rawCurve || typeof rawCurve.length !== 'number' || rawCurve.length === 0) {
		return null;
	}

	const N = rawCurve.length;
	const duration = audioDuration > 0 ? audioDuration : N * fallbackSecondsPerFrame;
	const timestep = duration / Math.max(1, N - 1);

	let sum = 0;
	for (let i = 0; i < N; i++) {
		sum += rawCurve[i];
	}
	const mean = sum / N;

	let squaredDiffSum = 0;
	for (let i = 0; i < N; i++) {
		const diff = rawCurve[i] - mean;
		squaredDiffSum += diff * diff;
	}
	const std = Math.sqrt(squaredDiffSum / N) || 1;

	const normalized = new Float32Array(N);
	for (let i = 0; i < N; i++) {
		const z = (rawCurve[i] - mean) / (std || 1e-9);
		normalized[i] = clamp01((z + 2) / 4);
	}

	const smoothed = new Float32Array(N);
	if (smoothing > 0) {
		const alpha = smoothing;
		smoothed[0] = normalized[0];
		for (let i = 1; i < N; i++) {
			smoothed[i] = alpha * normalized[i] + (1 - alpha) * smoothed[i - 1];
		}
	} else {
		smoothed.set(normalized);
	}

	const speedCurve = new Float32Array(N);
	const speedRange = maxSpeed - minSpeed;
	let minComputedSpeed = Number.POSITIVE_INFINITY;
	let maxComputedSpeed = Number.NEGATIVE_INFINITY;
	for (let i = 0; i < N; i++) {
		const shaped = Math.pow(smoothed[i], punch);
		const speed = minSpeed + speedRange * shaped;
		speedCurve[i] = speed;
		if (speed < minComputedSpeed) minComputedSpeed = speed;
		if (speed > maxComputedSpeed) maxComputedSpeed = speed;
	}

	const timeRemap = new Float32Array(N);
	timeRemap[0] = 0;
	for (let i = 1; i < N; i++) {
		const avgSpeed = (speedCurve[i - 1] + speedCurve[i]) * 0.5;
		timeRemap[i] = timeRemap[i - 1] + avgSpeed * timestep;
	}

	const sampleIndices = [0, Math.floor(N / 4), Math.floor(N / 2), Math.floor((3 * N) / 4), N - 1];

	return {
		speedCurve,
		timeRemap,
		timestep,
		stats: {
			count: N,
			duration,
			timestep,
			mean,
			std,
			minComputedSpeed,
			maxComputedSpeed,
			sampleIndices
		}
	};
}

/**
 * Sample a curve by audio time using floor index lookup and bounds clamping.
 */
export function sampleCurveAtTime(curve, timeSeconds, timestep) {
	if (!curve || curve.length === 0 || !Number.isFinite(timestep) || timestep <= 0) {
		return null;
	}
	const index = Math.floor(timeSeconds / timestep);
	const clampedIndex = Math.max(0, Math.min(curve.length - 1, index));
	return {
		index: clampedIndex,
		value: curve[clampedIndex]
	};
}
