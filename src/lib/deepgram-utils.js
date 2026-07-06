import { exportSRT } from './srt-utils.js';
import {
	buildDeepgramListenQuery,
	DEEPGRAM_LISTEN_URL,
	pickTranscribeTransport,
	VERCEL_TRANSCRIBE_BODY_LIMIT
} from './deepgram-listen.js';

export const DEEPGRAM_DEV_TRANSCRIBE_ENDPOINT = '/api/transcribe';

function deepgramListenOptions(options = {}) {
	return {
		model: options.model || import.meta.env.VITE_DEEPGRAM_MODEL || 'nova-3',
		language: options.language || import.meta.env.VITE_DEEPGRAM_LANGUAGE || 'en'
	};
}

async function parseDeepgramHttpResponse(response) {
	let payload;
	const text = await response.text();
	try {
		payload = text ? JSON.parse(text) : {};
	} catch {
		payload = { error: text };
	}
	return { payload, text };
}

function throwDeepgramHttpError(response, payload, text) {
	if (response.status === 401) {
		throw new Error(
			'Deepgram authentication failed (401). Check DEEPGRAM_API_KEY (server) or VITE_DEEPGRAM_API_KEY (browser for large stems), then restart and retry.'
		);
	}
	if (response.status === 413) {
		throw new Error(
			`Vocal stem is too large for the server proxy (${Math.round(VERCEL_TRANSCRIBE_BODY_LIMIT / (1024 * 1024))} MB Vercel limit). Add VITE_DEEPGRAM_API_KEY to your environment so transcription runs directly from the browser to Deepgram (same pattern as Essentia).`
		);
	}
	throw new Error(
		payload?.error || payload?.reason || payload?.err_msg || text || `Deepgram transcription failed (${response.status})`
	);
}

async function postAudioToDeepgramListen(file, options = {}) {
	const apiKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
	if (!apiKey) {
		throw new Error(
			`Vocal stem exceeds the ${Math.round(VERCEL_TRANSCRIBE_BODY_LIMIT / (1024 * 1024))} MB server upload limit. Set VITE_DEEPGRAM_API_KEY in .env / Vercel so Deepgram is called directly from the browser (no size cap through Vercel).`
		);
	}

	const query = buildDeepgramListenQuery(deepgramListenOptions(options));
	const response = await fetch(`${DEEPGRAM_LISTEN_URL}?${query}`, {
		method: 'POST',
		headers: {
			Authorization: `Token ${apiKey}`,
			'Content-Type': file.type || 'application/octet-stream'
		},
		body: file
	});

	const { payload, text } = await parseDeepgramHttpResponse(response);
	if (!response.ok || payload?.ok === false) {
		throwDeepgramHttpError(response, payload, text);
	}
	return payload;
}

async function postAudioToTranscribeProxy(file, endpoint) {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': file.type || 'application/octet-stream',
			'X-Audio-Filename': encodeURIComponent(file.name || 'song-audio')
		},
		body: file
	});

	const { payload, text } = await parseDeepgramHttpResponse(response);
	if (!response.ok || payload?.ok === false) {
		throwDeepgramHttpError(response, payload, text);
	}
	return payload;
}

function getPrimaryAlternative(response) {
	return response?.results?.channels?.[0]?.alternatives?.[0] || {};
}

function cleanText(value) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.trim();
}

function chunkWords(words, duration = 8) {
	if (!Array.isArray(words) || words.length === 0) return [];
	const chunks = [];
	let current = [];
	let start = Number(words[0]?.start) || 0;

	for (const word of words) {
		const wordStart = Number(word.start) || start;
		const wordEnd = Number(word.end) || wordStart + 0.3;
		if (current.length > 0 && wordEnd - start >= duration) {
			chunks.push({
				index: chunks.length + 1,
				start,
				end: Number(current.at(-1)?.end) || wordEnd,
				text: current.map((item) => item.punctuated_word || item.word).join(' ')
			});
			current = [];
			start = wordStart;
		}
		current.push(word);
	}

	if (current.length > 0) {
		chunks.push({
			index: chunks.length + 1,
			start,
			end: Number(current.at(-1)?.end) || start + duration,
			text: current.map((item) => item.punctuated_word || item.word).join(' ')
		});
	}

	return chunks.map((chunk) => ({ ...chunk, text: cleanText(chunk.text) }));
}

function chunksFromParagraphs(paragraphs) {
	const sentences = paragraphs?.paragraphs?.flatMap((paragraph) => paragraph.sentences || []) || [];
	return sentences
		.filter((sentence) => cleanText(sentence.text))
		.map((sentence, index) => ({
			index: index + 1,
			start: Number(sentence.start) || 0,
			end: Math.max(Number(sentence.end) || 0, Number(sentence.start) || 0),
			text: cleanText(sentence.text)
		}))
		.filter((chunk) => chunk.end > chunk.start);
}

function chunksFromUtterances(utterances) {
	return (utterances || [])
		.filter((utterance) => cleanText(utterance.transcript))
		.map((utterance, index) => ({
			index: index + 1,
			start: Number(utterance.start) || 0,
			end: Math.max(Number(utterance.end) || 0, Number(utterance.start) || 0),
			text: cleanText(utterance.transcript),
			confidence: utterance.confidence,
			sentiment: utterance.sentiment,
			sentimentScore: utterance.sentiment_score
		}))
		.filter((chunk) => chunk.end > chunk.start);
}

function extractSummary(response) {
	const summary = response?.results?.summary;
	if (!summary) return '';
	if (typeof summary === 'string') return cleanText(summary);
	return cleanText(summary.short || summary.result || summary.text || summary.summary);
}

function normalizeLabeledSegments(segments, key) {
	return (segments || []).flatMap((segment) =>
		(segment?.[key] || []).map((item) => ({
			label: cleanText(item.topic || item.intent || item.label || item.text),
			confidence: Number(item.confidence ?? item.score ?? 0),
			start: Number(segment.start_word ?? segment.start ?? 0),
			end: Number(segment.end_word ?? segment.end ?? 0)
		}))
	);
}

function rankLabels(items, fallbackWordCount = 0) {
	const totals = new Map();
	for (const item of items || []) {
		if (!item.label) continue;
		const previous = totals.get(item.label) || { label: item.label, score: 0, count: 0 };
		previous.score += Number(item.confidence) || 0.5;
		previous.count += 1;
		totals.set(item.label, previous);
	}
	const ranked = [...totals.values()].sort((a, b) => b.score - a.score);
	const totalScore =
		ranked.reduce((sum, item) => sum + item.score, 0) || fallbackWordCount || ranked.length || 1;
	return ranked.map((item) => ({
		...item,
		percent: Math.round((item.score / totalScore) * 10000) / 100
	}));
}

function extractTopicItems(response) {
	const topics = response?.results?.topics;
	if (Array.isArray(topics)) return topics;
	return [
		...normalizeLabeledSegments(topics?.segments, 'topics'),
		...normalizeLabeledSegments(topics?.results, 'topics')
	];
}

function extractIntentItems(response) {
	const intents = response?.results?.intents;
	if (Array.isArray(intents)) return intents;
	return [
		...normalizeLabeledSegments(intents?.segments, 'intents'),
		...normalizeLabeledSegments(intents?.results, 'intents')
	];
}

export function buildSrtChunksFromDeepgram(response, options = {}) {
	const alternative = getPrimaryAlternative(response);
	const duration = Number(response?.metadata?.duration) || Number(options.duration) || 60;
	const utteranceChunks = chunksFromUtterances(response?.results?.utterances);
	if (utteranceChunks.length > 0) return utteranceChunks;

	const paragraphChunks = chunksFromParagraphs(alternative.paragraphs);
	if (paragraphChunks.length > 0) return paragraphChunks;

	const wordChunks = chunkWords(alternative.words, Number(options.chunkDuration) || 8);
	if (wordChunks.length > 0) return wordChunks;

	const transcript = cleanText(alternative.transcript);
	return transcript
		? [
				{
					index: 1,
					start: 0,
					end: Math.max(1, duration),
					text: transcript
				}
			]
		: [];
}

export function summarizeDeepgramResponse(response, options = {}) {
	const alternative = getPrimaryAlternative(response);
	const chunks = buildSrtChunksFromDeepgram(response, options);
	const transcript = cleanText(
		alternative.transcript || chunks.map((chunk) => chunk.text).join(' ')
	);
	const sentiments = response?.results?.sentiments || null;
	const entities = alternative.entities || [];
	const words = alternative.words || [];
	const topics = rankLabels(extractTopicItems(response), words.length);
	const intents = rankLabels(extractIntentItems(response), words.length);
	const summary = extractSummary(response);

	return {
		provider: 'deepgram',
		model: response?.metadata?.model_info ? 'nova-3' : options.model || 'nova-3',
		duration: Number(response?.metadata?.duration) || Number(options.duration) || 0,
		confidence: alternative.confidence ?? null,
		transcript,
		wordCount: words.length || transcript.split(/\s+/).filter(Boolean).length,
		chunks,
		srt: chunks.length > 0 ? exportSRT(chunks) : '',
		summary,
		topics,
		intents,
		sentiments,
		averageSentiment: sentiments?.average || null,
		entities,
		warnings: response?.metadata?.warnings || response?.warnings || []
	};
}

export async function transcribeAudioWithDeepgram(file, options = {}) {
	if (!file) throw new Error('Select a vocal stem before transcription.');

	const endpoint = options.endpoint || DEEPGRAM_DEV_TRANSCRIBE_ENDPOINT;
	const transport = options.transport || pickTranscribeTransport(file);

	const payload =
		transport === 'direct'
			? await postAudioToDeepgramListen(file, options)
			: await postAudioToTranscribeProxy(file, endpoint);

	return summarizeDeepgramResponse(payload, {
		duration: options.duration,
		model: options.model || 'nova-3'
	});
}
