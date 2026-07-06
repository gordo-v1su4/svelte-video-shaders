/** Shared Deepgram Listen query params for lyric/SRT extraction. */
export function buildDeepgramListenQuery({
	model = 'nova-3',
	language = 'en'
} = {}) {
	return new URLSearchParams({
		model,
		summarize: 'v2',
		topics: 'true',
		intents: 'true',
		smart_format: 'true',
		punctuate: 'true',
		utterances: 'true',
		utt_split: '0.8',
		paragraphs: 'true',
		detect_entities: 'false',
		sentiment: 'false',
		language
	});
}

export const DEEPGRAM_LISTEN_URL = 'https://api.deepgram.com/v1/listen';

/** Vercel serverless request body limit (~4.5 MB). Stay under for proxy route. */
export const VERCEL_TRANSCRIBE_BODY_LIMIT = 4 * 1024 * 1024;

/**
 * @param {File} file
 * @returns {'direct' | 'proxy'}
 */
export function pickTranscribeTransport(file) {
	const clientKey = import.meta.env.VITE_DEEPGRAM_API_KEY || '';
	if (clientKey) return 'direct';
	if (file?.size > VERCEL_TRANSCRIBE_BODY_LIMIT) return 'direct';
	return 'proxy';
}
