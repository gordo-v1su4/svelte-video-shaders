import { describe, expect, it } from 'vitest';
import { buildSrtChunksFromDeepgram, summarizeDeepgramResponse } from './deepgram-utils.js';
import { distributeLyricsAcrossSections, exportSRT, parseSRT } from './srt-utils.js';
import {
	PREFERRED_GEMINI_IMAGE_MODEL,
	buildGeminiImageGenerationPayload,
	generateStoryPlanFromChunks
} from './story-prompt-utils.js';
import { generateAutoEditPlan } from './auto-edit.js';

describe('srt and auto edit utilities', () => {
	it('parses and exports multiline SRT chunks', () => {
		const chunks = parseSRT(
			'1\n00:00:00,000 --> 00:00:03,500\nHello\nworld\n\n2\n00:00:03,500 --> 00:00:07,000\nChorus'
		);
		expect(chunks).toHaveLength(2);
		expect(chunks[0].text).toBe('Hello\nworld');
		expect(exportSRT(chunks)).toContain('00:00:03,500 --> 00:00:07,000');
	});

	it('distributes lyrics and creates prompt chunks', () => {
		const chunks = distributeLyricsAcrossSections(
			'line one\nline two\nline three',
			[
				{ label: 'verse', start: 0, end: 10 },
				{ label: 'chorus', start: 10, end: 20 }
			],
			20
		);
		const plan = generateStoryPlanFromChunks(chunks, { title: 'Test Song' });
		expect(plan.chunks).toHaveLength(2);
		expect(plan.chunks[0].prompt).toContain('Lyrics/section text');
		expect(plan.imageModel).toBe(PREFERRED_GEMINI_IMAGE_MODEL);
	});

	it('builds reference-aware Gemini image payloads like the example workflow', () => {
		const chunks = parseSRT('1\n00:00:00,000 --> 00:00:05,000\nRun through neon tunnels');
		const plan = generateStoryPlanFromChunks(chunks, {
			title: 'Reference Test',
			referenceImages: [
				{ role: 'character', label: 'purple hair main character', data: 'abc' },
				{ role: 'environment', label: 'green industrial moodboard', data: 'def' }
			]
		});
		const payload = buildGeminiImageGenerationPayload({ storyPlan: plan, chunk: plan.chunks[0] });
		expect(payload.model).toBe(PREFERRED_GEMINI_IMAGE_MODEL);
		expect(payload.referenceImages).toHaveLength(2);
		expect(payload.prompt).toContain('consistent main character');
		expect(payload.systemInstruction).toContain('3x3 cinematic sequence');
	});

	it('generates deterministic editable auto edit data', () => {
		const chunks = parseSRT(
			'1\n00:00:00,000 --> 00:00:05,000\nVerse text\n\n2\n00:00:05,000 --> 00:00:10,000\nChorus text'
		);
		const videoAssets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
		const plan = generateAutoEditPlan({
			chunks,
			markers: [0, 1, 2, 5, 6, 7],
			videoAssets,
			presetId: 'high-energy-glitch',
			seed: 2
		});
		expect(plan.ready).toBe(true);
		expect(plan.clipAssignments).toHaveLength(2);
		expect(plan.cutMarkers.length).toBeGreaterThan(0);
		expect(plan.triggerSettings.intensity).toBeGreaterThan(0.5);
		expect(plan.speedRamp.enabled).toBe(true);
		expect(plan.regeneration).toStrictEqual({ presetId: 'high-energy-glitch', seed: 2 });
	});

	it('reports not-ready instead of throwing without videos', () => {
		const plan = generateAutoEditPlan({
			chunks: [{ index: 1, start: 0, end: 1, text: 'x' }],
			videoAssets: []
		});
		expect(plan.ready).toBe(false);
	});

	it('turns Deepgram utterances into SRT-ready chunks and sentiment metadata', () => {
		const response = {
			metadata: { duration: 12 },
			results: {
				summary: { short: 'A lyric fragment about neon rain and rising through static.' },
				topics: {
					segments: [
						{
							topics: [
								{ topic: 'Love', confidence: 0.8 },
								{ topic: 'Rushing Over', confidence: 0.4 }
							]
						}
					]
				},
				intents: {
					segments: [
						{
							intents: [
								{ intent: 'Expressing Love', confidence: 0.7 },
								{ intent: 'Expressing Understanding', confidence: 0.3 }
							]
						}
					]
				},
				utterances: [
					{ start: 0.5, end: 4, transcript: 'neon rain is falling', confidence: 0.91 },
					{ start: 4.5, end: 9, transcript: 'we rise through the static', confidence: 0.88 }
				],
				sentiments: { average: { sentiment: 'positive', sentiment_score: 0.44 } },
				channels: [
					{
						alternatives: [
							{
								transcript: 'neon rain is falling we rise through the static',
								confidence: 0.9,
								words: []
							}
						]
					}
				]
			}
		};
		const chunks = buildSrtChunksFromDeepgram(response);
		const summary = summarizeDeepgramResponse(response);

		expect(chunks).toHaveLength(2);
		expect(summary.srt).toContain('00:00:04,500 --> 00:00:09,000');
		expect(summary.averageSentiment.sentiment).toBe('positive');
		expect(summary.summary).toContain('neon rain');
		expect(summary.topics[0].label).toBe('Love');
		expect(summary.intents[0].label).toBe('Expressing Love');
	});
});
