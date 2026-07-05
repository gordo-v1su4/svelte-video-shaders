import { describe, it, expect } from 'vitest';
import {
	filterMarkersByDensity,
	computeGridMarkers,
	preprocessSpeedCurve,
	sampleSpeedCurve,
	TriggerScheduler,
	postProcessSections,
	sectionAtTime,
	formatTime
} from './playback-engine.js';

describe('filterMarkersByDensity', () => {
	it('keeps all markers at density 1', () => {
		const markers = [0.1, 0.2, 0.3, 0.4];
		expect(filterMarkersByDensity(markers, { density: 1 })).toEqual(markers);
	});

	it('enforces a minimum interval at low density', () => {
		const markers = Array.from({ length: 100 }, (_, i) => i * 0.05);
		const filtered = filterMarkersByDensity(markers, { density: 0.2, bpm: 120 });
		for (let i = 1; i < filtered.length; i++) {
			expect(filtered[i] - filtered[i - 1]).toBeGreaterThanOrEqual(0.05);
		}
		expect(filtered.length).toBeLessThan(markers.length);
	});

	it('drops markers past maxDuration', () => {
		expect(filterMarkersByDensity([1, 2, 99], { maxDuration: 10 })).toEqual([1, 2]);
	});

	it('random skip is deterministic per seed', () => {
		const markers = Array.from({ length: 50 }, (_, i) => i * 0.5);
		const a = filterMarkersByDensity(markers, { randomSkip: true, skipChance: 0.5, seedOffset: 3 });
		const b = filterMarkersByDensity(markers, { randomSkip: true, skipChance: 0.5, seedOffset: 3 });
		expect(a).toEqual(b);
	});
});

describe('computeGridMarkers', () => {
	it('returns empty without duration', () => {
		expect(computeGridMarkers({ bpm: 120, duration: 0 })).toEqual([]);
	});

	it('spaces markers at 1/32 intervals', () => {
		const grid = computeGridMarkers({ bpm: 120, duration: 4 });
		// 120bpm -> 0.5s/beat -> 0.0625s per 1/32
		expect(grid[1] - grid[0]).toBeCloseTo(0.0625, 5);
		expect(grid[grid.length - 1]).toBeLessThan(4);
	});
});

describe('speed curve', () => {
	it('returns null for empty curves', () => {
		expect(preprocessSpeedCurve(null, {})).toBeNull();
		expect(preprocessSpeedCurve([], {})).toBeNull();
	});

	it('bounds speeds within min/max and remap is monotonic', () => {
		const curve = Array.from({ length: 200 }, (_, i) => Math.sin(i / 10) * 0.5 + 0.5);
		const result = preprocessSpeedCurve(curve, { duration: 20, minSpeed: 0.8, maxSpeed: 1.8 });
		for (const speed of result.speeds) {
			expect(speed).toBeGreaterThanOrEqual(0.8);
			expect(speed).toBeLessThanOrEqual(1.8);
		}
		for (let i = 1; i < result.timeRemap.length; i++) {
			expect(result.timeRemap[i]).toBeGreaterThan(result.timeRemap[i - 1]);
		}
	});

	it('samples speed and remapped time at an audio time', () => {
		const curve = new Array(100).fill(0.5);
		const result = preprocessSpeedCurve(curve, { duration: 10, minSpeed: 1, maxSpeed: 1 });
		const sample = sampleSpeedCurve(result, 5);
		expect(sample.speed).toBe(1);
		// One-bin quantization from the lookup index
		expect(Math.abs(sample.remappedTime - 5)).toBeLessThan(result.timestep * 2);
	});

	it('passes through when no curve given', () => {
		expect(sampleSpeedCurve(null, 3)).toEqual({ speed: 1, remappedTime: 3 });
	});
});

describe('TriggerScheduler', () => {
	const triggers = [1, 2, 3, 4];

	it('reports markers crossed since last advance', () => {
		const s = new TriggerScheduler();
		s.reset(triggers, 0);
		expect(s.advance(triggers, 0.5)).toEqual([]);
		expect(s.advance(triggers, 1.1)).toEqual([1]);
		expect(s.advance(triggers, 2.05)).toEqual([2]);
		expect(s.advance(triggers, 3.0)).toEqual([3]);
	});

	it('resets silently on backwards seek', () => {
		const s = new TriggerScheduler();
		s.reset(triggers, 0);
		s.advance(triggers, 2.5);
		expect(s.advance(triggers, 0.5)).toEqual([]); // seek back: no phantom hits
		expect(s.advance(triggers, 1.2)).toEqual([1]);
	});

	it('resets on large forward gaps', () => {
		const s = new TriggerScheduler();
		s.reset(triggers, 0);
		expect(s.advance(triggers, 3.5)).toEqual([]); // >1s jump treated as seek
	});
});

describe('postProcessSections', () => {
	it('keeps valid detected sections', () => {
		const structure = {
			sections: [
				{ start: 0, end: 30, duration: 30, label: 'a' },
				{ start: 30, end: 60, duration: 30, label: 'b' }
			]
		};
		const result = postProcessSections(structure, 60);
		expect(result.sections).toHaveLength(2);
	});

	it('synthesizes a fallback layout for unusable sections', () => {
		const structure = { sections: [{ start: 0, end: 0.5, duration: 0.5, label: 'x' }] };
		const result = postProcessSections(structure, 180);
		expect(result.sections.length).toBeGreaterThan(1);
		const last = result.sections[result.sections.length - 1];
		expect(last.end).toBe(180);
	});

	it('returns empty without duration', () => {
		expect(postProcessSections({ sections: [] }, 0)).toEqual({ sections: [], boundaries: [] });
	});
});

describe('sectionAtTime', () => {
	const sections = [
		{ start: 0, end: 10, label: 'intro' },
		{ start: 10, end: 20, label: 'verse' }
	];

	it('finds the containing section with index', () => {
		expect(sectionAtTime(sections, 12).label).toBe('verse');
		expect(sectionAtTime(sections, 12).index).toBe(1);
	});

	it('clamps to the last section past the end', () => {
		expect(sectionAtTime(sections, 99).index).toBe(1);
	});

	it('defaults to a whole-song row without sections', () => {
		expect(sectionAtTime([], 5, 60)).toEqual({ label: 'song', start: 0, end: 60, index: 0 });
	});
});

describe('formatTime', () => {
	it('formats mm:ss', () => {
		expect(formatTime(0)).toBe('0:00');
		expect(formatTime(75)).toBe('1:15');
		expect(formatTime(NaN)).toBe('0:00');
	});
});
