export const AUTO_EDIT_PRESETS = [
	{
		id: 'balanced-music-video',
		label: 'Balanced Music Video',
		description: 'Moderate cuts, cinematic color, musical but not chaotic.',
		cutDensity: 0.55,
		shaderPresetIds: ['cinema-grade', 'dream-bloom', 'warm-halation'],
		triggerIntensity: 0.45,
		triggerDecay: 0.12,
		speedRamp: { enabled: true, min: 0.85, max: 1.45, smoothing: 0.18, punch: 1.35 }
	},
	{
		id: 'high-energy-glitch',
		label: 'High Energy Glitch',
		description: 'Dense cuts, datamosh/glitch looks, strong transient hits.',
		cutDensity: 0.9,
		shaderPresetIds: ['block-tear', 'glitch-cut', 'tape-tracking-storm'],
		triggerIntensity: 0.85,
		triggerDecay: 0.08,
		speedRamp: { enabled: true, min: 0.65, max: 2.2, smoothing: 0.08, punch: 2.2 },
		glitch: true,
		jumpCuts: true
	},
	{
		id: 'dream-sync',
		label: 'Dream Sync',
		description: 'Slower cuts, bloom/halation/anamorphic looks, soft transitions.',
		cutDensity: 0.28,
		shaderPresetIds: ['dream-bloom', 'anamorphic-dream', 'warm-halation'],
		triggerIntensity: 0.28,
		triggerDecay: 0.22,
		speedRamp: { enabled: true, min: 0.78, max: 1.2, smoothing: 0.28, punch: 0.9 }
	},
	{
		id: 'analog-tape',
		label: 'Analog Tape',
		description: 'VHS/CRT/film grain with tape tracking hits on strong beats.',
		cutDensity: 0.48,
		shaderPresetIds: ['vhs-classic', 'clean-crt', 'dirty-16mm'],
		triggerIntensity: 0.62,
		triggerDecay: 0.14,
		speedRamp: { enabled: false, min: 0.9, max: 1.2, smoothing: 0.2, punch: 1.0 }
	}
];

export function getAutoEditPreset(id) {
	return AUTO_EDIT_PRESETS.find((preset) => preset.id === id) || AUTO_EDIT_PRESETS[0];
}

function markerStrength(marker, analysisData) {
	if (typeof marker === 'number') return 0.6;
	return Number(
		marker?.confidence ?? marker?.strength ?? marker?.energy ?? analysisData?.confidence ?? 0.65
	);
}

function collectMarkers({ chunks = [], markers = [], analysisData = {}, preset }) {
	const all = [];
	for (const chunk of chunks) {
		all.push({ time: chunk.start, source: 'srt', strength: 0.8, chunkIndex: chunk.index });
	}
	for (const marker of markers) {
		const time =
			typeof marker === 'number' ? marker : Number(marker?.time ?? marker?.start ?? marker);
		if (Number.isFinite(time))
			all.push({ time, source: 'beat', strength: markerStrength(marker, analysisData) });
	}
	all.sort((a, b) => a.time - b.time);
	const minGap = Math.max(0.18, 1.6 - preset.cutDensity * 1.3);
	const selected = [];
	let last = -Infinity;
	for (const marker of all) {
		if (marker.time - last >= minGap || marker.source === 'srt') {
			selected.push(marker);
			last = marker.time;
		}
	}
	return selected;
}

export function generateAutoEditPlan({
	chunks = [],
	sections = [],
	markers = [],
	videoAssets = [],
	analysisData = {},
	presetId = 'balanced-music-video',
	seed = 1
} = {}) {
	const preset = getAutoEditPreset(presetId);
	const safeChunks = chunks.length
		? chunks
		: sections.map((section, i) => ({
				index: i + 1,
				start: section.start,
				end: section.end,
				text: section.label || `Section ${i + 1}`
			}));
	if (safeChunks.length === 0)
		return { ready: false, reason: 'Add audio analysis, lyrics, or SRT chunks first.' };
	if (!Array.isArray(videoAssets) || videoAssets.length === 0)
		return { ready: false, reason: 'Add at least one source video or generated media asset.' };
	const cutMarkers = collectMarkers({ chunks: safeChunks, markers, analysisData, preset });
	const clipAssignments = safeChunks.map((chunk, i) => ({
		chunkIndex: chunk.index ?? i + 1,
		sectionIndex: i,
		videoIndex: (i + seed) % videoAssets.length,
		assetId: videoAssets[(i + seed) % videoAssets.length]?.id,
		shaderPresetId: preset.shaderPresetIds[i % preset.shaderPresetIds.length]
	}));
	return {
		ready: true,
		presetId: preset.id,
		presetLabel: preset.label,
		chunks: safeChunks,
		clipAssignments,
		cutMarkers,
		shaderPresetIds: [...preset.shaderPresetIds],
		triggerSettings: {
			intensity: preset.triggerIntensity,
			decay: preset.triggerDecay,
			markerThreshold: Math.max(1, Math.round(8 - preset.cutDensity * 6)),
			glitch: Boolean(preset.glitch),
			jumpCuts: Boolean(preset.jumpCuts)
		},
		speedRamp: preset.speedRamp,
		regeneration: { presetId: preset.id, seed }
	};
}
