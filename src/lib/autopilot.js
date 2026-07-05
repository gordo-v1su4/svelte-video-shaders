/**
 * Autopilot orchestrator - runs the full pipeline end-to-end with sensible
 * defaults and graceful degradation:
 *
 *   analyze (Essentia) -> transcribe (Deepgram, optional) -> story plan
 *   (local + optional Kimi) -> auto-edit plan
 *
 * Services are injected so the orchestrator is unit-testable and the same
 * code drives both Autopilot mode (all stages, no questions) and Studio mode
 * (stages triggered manually).
 */

import { generateAutoEditPlan } from '$lib/auto-edit.js';
import {
	generateStoryDirectionOptions,
	generateStoryPlanFromChunks
} from '$lib/story-prompt-utils.js';
import { postProcessSections } from '$lib/playback-engine.js';

export const AUTOPILOT_STAGES = [
	{ id: 'analyze', label: 'Analyze song', detail: 'Beats, BPM, sections, energy' },
	{ id: 'transcribe', label: 'Extract lyrics', detail: 'Deepgram vocal transcription' },
	{ id: 'story', label: 'Story plan', detail: 'Scene prompts per lyric chunk' },
	{ id: 'edit', label: 'Auto edit', detail: 'Cuts, shaders, speed ramp' }
];

/** @typedef {'pending'|'running'|'done'|'skipped'|'error'} StageStatus */

function attachSectionContext(chunks, sections) {
	return (chunks || []).map((chunk) => {
		const start = Number(chunk.start) || 0;
		const sectionIndex = sections.findIndex((s) => start >= s.start && start < s.end);
		const section = sectionIndex >= 0 ? sections[sectionIndex] : null;
		return {
			...chunk,
			sectionIndex,
			sectionLabel: section?.label || chunk.sectionLabel || 'song'
		};
	});
}

function chunksFromSections(sections) {
	return sections.map((section, i) => ({
		index: i + 1,
		start: section.start,
		end: section.end,
		text: section.label || `Section ${i + 1}`,
		sectionIndex: i,
		sectionLabel: section.label || `Section ${i + 1}`
	}));
}

function storyTitle(file) {
	return file?.name ? file.name.replace(/\.[^.]+$/, '') : 'Lyric Film';
}

function deepgramStoryArcHint(summary) {
	return [
		summary?.summary && `Summary: ${summary.summary}`,
		summary?.topics?.length &&
			`Topics: ${summary.topics.map((t) => `${t.label} ${t.percent}%`).join(', ')}`,
		summary?.intents?.length &&
			`Intents: ${summary.intents.map((t) => `${t.label} ${t.percent}%`).join(', ')}`
	]
		.filter(Boolean)
		.join('\n');
}

export function mergeKimiStoryIntoPlan(localPlan, remoteStory) {
	const beats = remoteStory?.beats || [];
	return {
		...localPlan,
		title: remoteStory?.title || localPlan.title,
		logline: remoteStory?.logline || localPlan.logline,
		seed: remoteStory?.storySeed || localPlan.seed,
		remoteStory,
		chunks: localPlan.chunks.map((chunk, index) => {
			const beat =
				beats[index] || beats.find((item) => Number(item.chunk_index) === Number(chunk.index));
			if (!beat) return chunk;
			return {
				...chunk,
				sectionLabel: beat.label || chunk.sectionLabel,
				prompt: beat.scene_description || chunk.prompt,
				imagePrompt: beat.keyframe_prompts?.[0] || beat.scene_description || chunk.imagePrompt,
				keyframePrompts: beat.keyframe_prompts || [],
				storyBeat: beat
			};
		})
	};
}

/**
 * Run the whole pipeline.
 *
 * @param {object} inputs
 * @param {File | null} inputs.song - the song driving the edit (required)
 * @param {File | null} inputs.stem - optional vocal stem for transcription
 * @param {Array} inputs.videoAssets - loaded video assets
 * @param {number} inputs.duration - song duration in seconds (0 = unknown)
 * @param {object} options
 * @param {object} options.services
 * @param {(file: File) => Promise<object>} options.services.analyze - Essentia analysis
 * @param {(file: File, opts: object) => Promise<object>} [options.services.transcribe] - Deepgram
 * @param {(payload: object) => Promise<object>} [options.services.story] - Kimi story pass
 * @param {(stageId: string, status: StageStatus, detail?: string) => void} [options.onStage]
 * @param {string} [options.presetId]
 * @param {number} [options.seed]
 */
export async function runAutopilot(inputs, options) {
	const { song, stem = null, videoAssets = [], duration = 0 } = inputs;
	const { services, onStage = () => {}, presetId = 'balanced-music-video', seed = 1 } = options;

	const warnings = [];
	if (!song) throw new Error('Autopilot needs a song to drive the edit.');

	// --- Stage 1: analysis ---
	onStage('analyze', 'running');
	let analysis;
	try {
		const raw = await services.analyze(song);
		const structure = postProcessSections(raw.structure, raw.duration || duration);
		analysis = {
			bpm: raw.bpm || 0,
			beats: raw.beats || [],
			onsets: raw.onsets || [],
			energy: raw.energy || null,
			confidence: raw.confidence,
			structure
		};
		onStage(
			'analyze',
			'done',
			`${Math.round(analysis.bpm)} BPM · ${analysis.onsets.length} onsets · ${structure.sections.length} sections`
		);
	} catch (err) {
		warnings.push(`Analysis failed: ${err?.message || err}`);
		analysis = {
			bpm: 0,
			beats: [],
			onsets: [],
			energy: null,
			structure: { sections: [], boundaries: [] }
		};
		onStage('analyze', 'error', err?.message || 'Analysis unavailable');
	}
	const sections = analysis.structure.sections;

	// --- Stage 2: transcription (optional) ---
	let transcript = null;
	let chunks = [];
	if (stem && services.transcribe) {
		onStage('transcribe', 'running');
		try {
			transcript = await services.transcribe(stem, { duration });
			chunks = attachSectionContext(transcript.chunks || [], sections);
			onStage('transcribe', 'done', `${transcript.wordCount || 0} words · ${chunks.length} chunks`);
		} catch (err) {
			warnings.push(`Transcription skipped: ${err?.message || err}`);
			onStage('transcribe', 'error', err?.message || 'Transcription unavailable');
		}
	} else {
		onStage('transcribe', 'skipped', stem ? 'No transcription service' : 'No vocal stem provided');
	}

	if (chunks.length === 0 && sections.length > 0) {
		chunks = chunksFromSections(sections);
	}

	// --- Stage 3: story plan ---
	onStage('story', 'running');
	const title = storyTitle(song);
	const storyDirections = generateStoryDirectionOptions(chunks, {
		title,
		transcriptSummary: transcript
	});
	let storyPlan = generateStoryPlanFromChunks(chunks, {
		title,
		storyArcHint: deepgramStoryArcHint(transcript),
		storyDirection: storyDirections[0] || null
	});
	if (services.story && chunks.length > 0) {
		try {
			const remote = await services.story({ chunks, storyPlan });
			if (remote?.success) {
				storyPlan = mergeKimiStoryIntoPlan(storyPlan, remote);
				onStage('story', 'done', `Kimi generated ${remote.beats?.length || 0} story beats`);
			} else {
				onStage('story', 'done', 'Local story prompts (Kimi unavailable)');
			}
		} catch (err) {
			warnings.push(`Kimi story pass failed: ${err?.message || err}`);
			onStage('story', 'done', 'Local story prompts (Kimi failed)');
		}
	} else {
		onStage(
			'story',
			chunks.length > 0 ? 'done' : 'skipped',
			chunks.length > 0 ? 'Local story prompts' : 'No chunks available'
		);
	}

	// --- Stage 4: auto edit ---
	onStage('edit', 'running');
	const editPlan = generateAutoEditPlan({
		chunks,
		sections,
		markers: analysis.onsets,
		videoAssets,
		analysisData: analysis,
		presetId,
		seed
	});
	if (editPlan.ready) {
		onStage('edit', 'done', `${editPlan.presetLabel}: ${editPlan.cutMarkers.length} cuts`);
	} else {
		warnings.push(editPlan.reason);
		onStage('edit', 'error', editPlan.reason);
	}

	return {
		analysis,
		transcript,
		chunks,
		storyDirections,
		storyPlan,
		editPlan,
		warnings
	};
}
