import { describe, expect, it } from 'vitest';
import {
	VERCEL_TRANSCRIBE_BODY_LIMIT,
	buildDeepgramListenQuery,
	pickTranscribeTransport
} from './deepgram-listen.js';

describe('deepgram-listen', () => {
	it('builds the lyric-oriented listen query', () => {
		const q = buildDeepgramListenQuery({ model: 'nova-3', language: 'en' });
		expect(q.get('model')).toBe('nova-3');
		expect(q.get('utterances')).toBe('true');
		expect(q.get('utt_split')).toBe('0.8');
	});

	it('uses proxy for small files without a client key', () => {
		const file = new File(['x'], 'stem.wav', { type: 'audio/wav' });
		Object.defineProperty(file, 'size', { value: 1024 });
		expect(pickTranscribeTransport(file)).toBe('proxy');
	});

	it('prefers direct when file exceeds Vercel body limit', () => {
		const file = new File(['x'], 'stem.wav', { type: 'audio/wav' });
		Object.defineProperty(file, 'size', { value: VERCEL_TRANSCRIBE_BODY_LIMIT + 1 });
		expect(pickTranscribeTransport(file)).toBe('direct');
	});
});
