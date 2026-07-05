import { describe, it, expect } from 'vitest';
import { buildEditTimeline, groupTimelineIntoRuns, poolForSection } from './edit-timeline.js';

const FPS = 24;

describe('poolForSection', () => {
	it('returns explicit pool when defined', () => {
		expect(poolForSection(1, { 1: [2, 3] }, 5, true)).toEqual([2, 3]);
	});

	it('defaults section 0 to all clips when sections exist', () => {
		expect(poolForSection(0, {}, 3, true)).toEqual([0, 1, 2]);
	});

	it('defaults later sections to empty when sections exist', () => {
		expect(poolForSection(2, {}, 3, true)).toEqual([]);
	});

	it('defaults to all clips when there are no sections', () => {
		expect(poolForSection(0, {}, 4, false)).toEqual([0, 1, 2, 3]);
	});
});

describe('buildEditTimeline', () => {
	const clips = [{ frameCount: 240 }, { frameCount: 240 }, { frameCount: 240 }];

	it('produces one entry per output frame', () => {
		const timeline = buildEditTimeline({ durationSec: 2, fps: FPS, clips });
		expect(timeline).toHaveLength(48);
		expect(timeline[0]).toEqual({ clipIndex: 0, localFrame: 0 });
	});

	it('advances local frames with elapsed time', () => {
		const timeline = buildEditTimeline({ durationSec: 2, fps: FPS, clips });
		expect(timeline[10].localFrame).toBe(10);
		expect(timeline[47].localFrame).toBe(47);
	});

	it('swaps clips after markerSwapThreshold trigger hits', () => {
		const timeline = buildEditTimeline({
			durationSec: 4,
			fps: FPS,
			clips,
			triggers: [0.5, 1.0, 1.5, 2.0],
			markerSwapThreshold: 2
		});
		// Before the 2nd hit at t=1.0 we should still be on clip 0
		expect(timeline[Math.floor(0.9 * FPS)].clipIndex).toBe(0);
		// After the 2nd hit (t=1.0) clip advances to 1
		expect(timeline[Math.floor(1.2 * FPS)].clipIndex).toBe(1);
		// After the 4th hit (t=2.0) clip advances to 2
		expect(timeline[Math.floor(2.2 * FPS)].clipIndex).toBe(2);
	});

	it('resets elapsed mapping at clip swaps', () => {
		const timeline = buildEditTimeline({
			durationSec: 2,
			fps: FPS,
			clips,
			triggers: [1.0],
			markerSwapThreshold: 1
		});
		const swapFrame = Math.ceil(1.0 * FPS);
		expect(timeline[swapFrame].clipIndex).toBe(1);
		expect(timeline[swapFrame].localFrame).toBe(0);
	});

	it('keeps clips inside section pools', () => {
		const timeline = buildEditTimeline({
			durationSec: 4,
			fps: FPS,
			clips,
			sections: [
				{ start: 0, end: 2, label: 'verse' },
				{ start: 2, end: 4, label: 'chorus' }
			],
			sectionVideoPools: { 0: [0], 1: [2] }
		});
		expect(timeline[Math.floor(1 * FPS)].clipIndex).toBe(0);
		expect(timeline[Math.floor(3 * FPS)].clipIndex).toBe(2);
	});

	it('emits null clip when a section pool is empty', () => {
		const timeline = buildEditTimeline({
			durationSec: 2,
			fps: FPS,
			clips,
			sections: [
				{ start: 0, end: 1, label: 'a' },
				{ start: 1, end: 2, label: 'b' }
			],
			sectionVideoPools: { 0: [1], 1: [] }
		});
		expect(timeline[Math.floor(0.5 * FPS)].clipIndex).toBe(1);
		expect(timeline[Math.floor(1.5 * FPS)].clipIndex).toBeNull();
	});

	it('uses the speed curve remap for direct frame mapping', () => {
		// Constant 2x speed: remappedTime = 2t
		const N = 96;
		const speeds = new Float32Array(N).fill(2);
		const timeRemap = new Float32Array(N);
		const timestep = 4 / (N - 1);
		for (let i = 1; i < N; i++) timeRemap[i] = timeRemap[i - 1] + 2 * timestep;
		const timeline = buildEditTimeline({
			durationSec: 4,
			fps: FPS,
			clips,
			speedCurve: { speeds, timeRemap, timestep }
		});
		const t = 1.0;
		const frame = timeline[Math.floor(t * FPS)];
		// ~2x faster than realtime (allow rounding slack from curve sampling)
		expect(frame.localFrame).toBeGreaterThan(FPS * t * 1.7);
		expect(frame.localFrame).toBeLessThan(FPS * t * 2.3);
	});

	it('wraps local frames past the end of the clip', () => {
		const shortClips = [{ frameCount: 10 }];
		const timeline = buildEditTimeline({ durationSec: 1, fps: FPS, clips: shortClips });
		expect(timeline[15].localFrame).toBe(5);
	});

	it('is deterministic for the same seed', () => {
		const params = {
			durationSec: 3,
			fps: FPS,
			clips,
			triggers: [0.4, 0.9, 1.3, 1.8, 2.4],
			markerSwapThreshold: 2,
			jumpCuts: true,
			seed: 7
		};
		expect(buildEditTimeline(params)).toEqual(buildEditTimeline(params));
	});
});

describe('groupTimelineIntoRuns', () => {
	it('splits runs on clip changes', () => {
		const timeline = [
			{ clipIndex: 0, localFrame: 0 },
			{ clipIndex: 0, localFrame: 1 },
			{ clipIndex: 1, localFrame: 0 },
			{ clipIndex: 1, localFrame: 1 }
		];
		const runs = groupTimelineIntoRuns(timeline);
		expect(runs).toHaveLength(2);
		expect(runs[0].clipIndex).toBe(0);
		expect(runs[1].startFrame).toBe(2);
	});

	it('splits runs when local frames wrap backwards', () => {
		const timeline = [
			{ clipIndex: 0, localFrame: 8 },
			{ clipIndex: 0, localFrame: 9 },
			{ clipIndex: 0, localFrame: 0 }, // wrapped
			{ clipIndex: 0, localFrame: 1 }
		];
		const runs = groupTimelineIntoRuns(timeline);
		expect(runs).toHaveLength(2);
		expect(runs[1].entries[0].localFrame).toBe(0);
	});

	it('keeps every output frame exactly once and in order', () => {
		const timeline = buildEditTimeline({
			durationSec: 3,
			fps: FPS,
			clips: [{ frameCount: 24 }, { frameCount: 24 }],
			triggers: [0.5, 1.1, 1.7, 2.3],
			markerSwapThreshold: 1
		});
		const runs = groupTimelineIntoRuns(timeline);
		const outputFrames = runs.flatMap((run) => run.entries.map((entry) => entry.outputFrame));
		expect(outputFrames).toEqual(Array.from({ length: timeline.length }, (_, i) => i));
		// Within each run, local frames ascend (single forward decode pass)
		for (const run of runs) {
			for (let i = 1; i < run.entries.length; i++) {
				expect(run.entries[i].localFrame).toBeGreaterThanOrEqual(run.entries[i - 1].localFrame);
			}
		}
	});
});
