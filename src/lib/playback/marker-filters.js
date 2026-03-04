function seededRandom(seed) {
	const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
}

export function filterMidiMarkers({
	midiMarkers,
	midiDensity,
	enableRandomSkip,
	randomSkipChance,
	audioDuration,
	bpm
}) {
	if (!midiMarkers || midiMarkers.length === 0) return [];

	const safeBpm = bpm > 0 ? bpm : 120;
	const secondsPerBeat = 60 / safeBpm;
	const interval32 = secondsPerBeat / 8;

	let markers = midiMarkers
		.map((t) => (typeof t === 'number' ? t : parseFloat(t)))
		.filter((t) => !isNaN(t) && t >= 0)
		.filter((t) => !audioDuration || t <= audioDuration);

	if (midiDensity < 1.0) {
		const scaler = 1 + (1 - midiDensity) * 31;
		const effectiveMinInterval = interval32 * scaler;
		let lastTime = -effectiveMinInterval;
		const result = [];

		for (const marker of markers) {
			if (marker - lastTime >= effectiveMinInterval) {
				result.push(marker);
				lastTime = marker;
			}
		}
		markers = result;
	}

	if (enableRandomSkip && randomSkipChance > 0) {
		markers = markers.filter((_, i) => seededRandom(i) > randomSkipChance);
	}

	return markers;
}

export function filterEssentiaOnsets({
	onsets,
	onsetDensity,
	enableRandomSkip,
	randomSkipChance,
	bpm
}) {
	if (!onsets || onsets.length === 0) return [];

	const safeBpm = bpm > 0 ? bpm : 120;
	const secondsPerBeat = 60 / safeBpm;
	const interval32 = secondsPerBeat / 8;
	const scaler = 1 + (1 - onsetDensity) * 31;
	const effectiveMinInterval = interval32 * scaler;

	let result = [];
	let lastTime = -effectiveMinInterval;

	for (const onset of onsets) {
		if (onset - lastTime >= effectiveMinInterval) {
			result.push(onset);
			lastTime = onset;
		}
	}

	if (enableRandomSkip && randomSkipChance > 0) {
		result = result.filter((_, i) => seededRandom(i + 1000) > randomSkipChance);
	}

	return result;
}

