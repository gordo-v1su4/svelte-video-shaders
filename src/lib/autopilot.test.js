import { describe, it, expect, vi } from 'vitest';
import { runAutopilot, mergeKimiStoryIntoPlan, AUTOPILOT_STAGES } from './autopilot.js';

const song = new File(['x'], 'my-song.mp3', { type: 'audio/mpeg' });
const stem = new File(['x'], 'vocals-stem.wav', { type: 'audio/wav' });
const videoAssets = [
	{ id: 'a', name: 'a.mp4' },
	{ id: 'b', name: 'b.mp4' }
];

const analysisFixture = {
	bpm: 120,
	beats: [0.5, 1, 1.5, 2],
	onsets: [0.5, 1, 1.5, 2, 2.5, 3],
	energy: { curve: [0.2, 0.6, 0.9, 0.4] },
	confidence: 0.9,
	duration: 60,
	structure: {
		sections: [
			{ start: 0, end: 20, label: 'verse', duration: 20, energy: 0 },
			{ start: 20, end: 60, label: 'chorus', duration: 40, energy: 0 }
		],
		boundaries: [0, 20, 60]
	}
};

function makeServices(overrides = {}) {
	return {
		analyze: vi.fn().mockResolvedValue(analysisFixture),
		...overrides
	};
}

describe('runAutopilot', () => {
	it('throws without a song', async () => {
		await expect(runAutopilot({ song: null }, { services: makeServices() })).rejects.toThrow(
			/song/
		);
	});

	it('runs the full chain and produces a ready edit plan', async () => {
		const stages = [];
		const result = await runAutopilot(
			{ song, stem: null, videoAssets, duration: 60 },
			{
				services: makeServices(),
				onStage: (id, status) => stages.push(`${id}:${status}`)
			}
		);

		expect(result.analysis.bpm).toBe(120);
		expect(result.analysis.structure.sections).toHaveLength(2);
		// No stem -> transcription skipped, chunks fall back to sections
		expect(stages).toContain('transcribe:skipped');
		expect(result.chunks).toHaveLength(2);
		expect(result.storyPlan).toBeTruthy();
		expect(result.editPlan.ready).toBe(true);
		expect(result.editPlan.cutMarkers.length).toBeGreaterThan(0);
		expect(stages).toContain('edit:done');
	});

	it('transcribes when a stem and service are available', async () => {
		const transcribe = vi.fn().mockResolvedValue({
			wordCount: 42,
			chunks: [
				{ index: 1, start: 2, end: 6, text: 'first line' },
				{ index: 2, start: 25, end: 30, text: 'second line' }
			]
		});
		const result = await runAutopilot(
			{ song, stem, videoAssets, duration: 60 },
			{ services: makeServices({ transcribe }) }
		);

		expect(transcribe).toHaveBeenCalledWith(stem, { duration: 60 });
		expect(result.chunks).toHaveLength(2);
		// Section context attached from analysis structure
		expect(result.chunks[0].sectionLabel).toBe('verse');
		expect(result.chunks[1].sectionLabel).toBe('chorus');
	});

	it('degrades gracefully when transcription fails', async () => {
		const stages = [];
		const transcribe = vi.fn().mockRejectedValue(new Error('401'));
		const result = await runAutopilot(
			{ song, stem, videoAssets, duration: 60 },
			{
				services: makeServices({ transcribe }),
				onStage: (id, status) => stages.push(`${id}:${status}`)
			}
		);

		expect(stages).toContain('transcribe:error');
		expect(result.warnings.some((w) => w.includes('Transcription'))).toBe(true);
		// Still finishes the edit from section-derived chunks
		expect(result.editPlan.ready).toBe(true);
	});

	it('merges a successful Kimi story pass into the plan', async () => {
		const story = vi.fn().mockResolvedValue({
			success: true,
			title: 'Neon Rain',
			logline: 'A night drive through memory.',
			beats: [{ chunk_index: 1, label: 'opening', scene_description: 'city lights blur' }]
		});
		const result = await runAutopilot(
			{ song, stem: null, videoAssets, duration: 60 },
			{ services: makeServices({ story }) }
		);

		expect(story).toHaveBeenCalled();
		expect(result.storyPlan.title).toBe('Neon Rain');
		expect(result.storyPlan.chunks[0].prompt).toBe('city lights blur');
	});

	it('keeps the local story plan when Kimi fails', async () => {
		const story = vi.fn().mockRejectedValue(new Error('offline'));
		const result = await runAutopilot(
			{ song, stem: null, videoAssets, duration: 60 },
			{ services: makeServices({ story }) }
		);

		expect(result.storyPlan).toBeTruthy();
		expect(result.warnings.some((w) => w.includes('Kimi'))).toBe(true);
		expect(result.editPlan.ready).toBe(true);
	});

	it('reports a non-ready edit plan when there are no clips', async () => {
		const result = await runAutopilot(
			{ song, stem: null, videoAssets: [], duration: 60 },
			{ services: makeServices() }
		);
		expect(result.editPlan.ready).toBe(false);
	});

	it('covers all defined stage ids', () => {
		expect(AUTOPILOT_STAGES.map((s) => s.id)).toEqual(['analyze', 'transcribe', 'story', 'edit']);
	});
});

describe('mergeKimiStoryIntoPlan', () => {
	const localPlan = {
		title: 'Local',
		logline: 'local logline',
		seed: 3,
		chunks: [
			{ index: 1, sectionLabel: 'verse', prompt: 'local prompt 1' },
			{ index: 2, sectionLabel: 'chorus', prompt: 'local prompt 2' }
		]
	};

	it('overrides title/logline and maps beats onto chunks', () => {
		const merged = mergeKimiStoryIntoPlan(localPlan, {
			title: 'Remote',
			logline: 'remote logline',
			beats: [
				{ chunk_index: 1, label: 'act one', scene_description: 'remote scene 1' },
				{
					chunk_index: 2,
					label: 'act two',
					scene_description: 'remote scene 2',
					keyframe_prompts: ['kf']
				}
			]
		});

		expect(merged.title).toBe('Remote');
		expect(merged.chunks[0].prompt).toBe('remote scene 1');
		expect(merged.chunks[1].imagePrompt).toBe('kf');
		expect(merged.chunks[1].sectionLabel).toBe('act two');
	});

	it('leaves chunks untouched when no matching beat exists', () => {
		const merged = mergeKimiStoryIntoPlan(localPlan, { beats: [] });
		expect(merged.chunks[0].prompt).toBe('local prompt 1');
		expect(merged.title).toBe('Local');
	});
});
