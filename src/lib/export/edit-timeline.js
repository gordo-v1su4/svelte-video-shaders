/**
 * Deterministic edit timeline builder for MP4 export.
 *
 * Re-runs the same decisions the live playback engine makes (section pools,
 * beat-trigger clip swaps, jump cuts, speed-ramp frame mapping) as a pure
 * function of the edit state, producing one {clipIndex, localFrame} entry per
 * output frame. This is what makes the export frame-accurate and testable.
 */

import { seededRandom, sectionAtTime, sampleSpeedCurve } from '$lib/playback-engine.js';

/**
 * Replicates the live section pool semantics:
 * - explicit pool entry (including []) wins
 * - unset section index defaults to all clips
 */
export function poolForSection(sectionIndex, sectionVideoPools, clipCount) {
	if (sectionVideoPools && sectionIndex in sectionVideoPools) {
		const pool = sectionVideoPools[sectionIndex];
		return Array.isArray(pool) ? pool : [];
	}
	return Array.from({ length: clipCount }, (_, i) => i);
}

/**
 * @param {object} params
 * @param {number} params.durationSec - output duration in seconds
 * @param {number} [params.fps]
 * @param {number[]} params.triggers - sorted trigger times (filtered onsets)
 * @param {number} [params.markerSwapThreshold] - swap clip after N trigger hits
 * @param {Array<{start:number,end:number,label?:string}>} [params.sections]
 * @param {Record<number, number[]>} [params.sectionVideoPools]
 * @param {Array<{frameCount:number}>} params.clips - per-clip frame counts (at fps)
 * @param {{speeds:Float32Array,timeRemap:Float32Array,timestep:number}|null} [params.speedCurve]
 * @param {boolean} [params.jumpCuts]
 * @param {number} [params.jumpCutRange]
 * @param {number} [params.seed]
 * @returns {Array<{clipIndex: number|null, localFrame: number}>}
 */
export function buildEditTimeline({
	durationSec,
	fps = 24,
	triggers = [],
	markerSwapThreshold = 4,
	sections = [],
	sectionVideoPools = {},
	clips = [],
	speedCurve = null,
	jumpCuts = false,
	jumpCutRange = 30,
	seed = 1
}) {
	const totalFrames = Math.max(1, Math.ceil(durationSec * fps));
	const hasSections = sections.length > 0;
	const frames = new Array(totalFrames);

	let markerCounter = 0;
	let triggerCursor = 0;
	let hitCount = 0;

	let currentClip = null; // global clip index
	let clipStartTime = 0;
	let currentSectionIndex = -1;

	const clipFrameCount = (clipIndex) => clips[clipIndex]?.frameCount || 1;

	const pickFromPool = (pool, preferred = null) => {
		if (pool.length === 0) return null;
		if (preferred !== null && pool.includes(preferred)) return preferred;
		return pool[0];
	};

	for (let f = 0; f < totalFrames; f++) {
		const t = f / fps;

		// --- Section change: force clip into the section's pool ---
		const section = sectionAtTime(sections, t, durationSec);
		const pool = poolForSection(section.index, sectionVideoPools, clips.length, hasSections);
		if (section.index !== currentSectionIndex) {
			currentSectionIndex = section.index;
			if (currentClip === null || !pool.includes(currentClip)) {
				const next = pickFromPool(pool);
				if (next !== currentClip) {
					currentClip = next;
					clipStartTime = t;
				}
			}
		} else if (currentClip !== null && !pool.includes(currentClip)) {
			currentClip = pickFromPool(pool);
			clipStartTime = t;
		} else if (currentClip === null && pool.length > 0) {
			currentClip = pool[0];
			clipStartTime = t;
		}

		// --- Trigger hits since last frame ---
		let jumpOffsetThisFrame = 0;
		while (triggerCursor < triggers.length && triggers[triggerCursor] <= t) {
			triggerCursor++;
			hitCount++;
			markerCounter++;
			if (markerCounter >= markerSwapThreshold && pool.length > 1) {
				const poolPos = pool.indexOf(currentClip);
				currentClip = pool[(poolPos + 1) % pool.length];
				clipStartTime = t;
				markerCounter = 0;
			} else if (markerCounter >= markerSwapThreshold) {
				markerCounter = 0;
			}
			if (jumpCuts) {
				jumpOffsetThisFrame +=
					Math.floor(seededRandom(hitCount + seed) * jumpCutRange * 2) - jumpCutRange;
			}
		}

		// --- Frame mapping (mirrors ShaderPlayer.setAudioTime) ---
		if (currentClip === null || pool.length === 0) {
			frames[f] = { clipIndex: null, localFrame: 0 };
			continue;
		}

		const frameCount = clipFrameCount(currentClip);
		let targetFrame;
		if (speedCurve) {
			// Direct mapping: remapped virtual clock -> frame
			const { remappedTime } = sampleSpeedCurve(speedCurve, t);
			targetFrame = Math.floor(remappedTime * fps);
		} else {
			targetFrame = Math.floor(Math.max(0, t - clipStartTime) * fps);
		}
		targetFrame += jumpOffsetThisFrame;

		const localFrame = ((targetFrame % frameCount) + frameCount) % frameCount;
		frames[f] = { clipIndex: currentClip, localFrame };
	}

	return frames;
}

/**
 * Group a timeline into monotonic decode runs per clip, splitting on clip
 * changes and local-frame wraps so each run's timestamps ascend (which lets
 * mediabunny decode each run in a single forward pass).
 * @param {Array<{clipIndex: number|null, localFrame: number}>} timeline
 * @returns {Array<{clipIndex: number|null, startFrame: number, entries: Array<{outputFrame:number, localFrame:number}>}>}
 */
export function groupTimelineIntoRuns(timeline) {
	const runs = [];
	let current = null;

	for (let f = 0; f < timeline.length; f++) {
		const { clipIndex, localFrame } = timeline[f];
		const lastLocal = current?.entries.length
			? current.entries[current.entries.length - 1].localFrame
			: -1;
		if (!current || current.clipIndex !== clipIndex || localFrame < lastLocal) {
			current = { clipIndex, startFrame: f, entries: [] };
			runs.push(current);
		}
		current.entries.push({ outputFrame: f, localFrame });
	}

	return runs;
}
