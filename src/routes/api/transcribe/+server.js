import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Deepgram transcription proxy. Accepts raw audio bytes and forwards them to
 * Deepgram nova-3 with the settings the client pipeline expects. The API key
 * stays server-side.
 */
export async function POST({ request }) {
	const apiKey = env.DEEPGRAM_API_KEY || env.DEEPGRAM_TOKEN;
	if (!apiKey) {
		return json({
			ok: false,
			error:
				'DEEPGRAM_API_KEY is not configured. Audio analysis still works; transcription/SRT extraction is waiting for the key.'
		});
	}

	const body = await request.arrayBuffer();
	if (body.byteLength === 0) {
		return json({ ok: false, error: 'No audio bytes received.' }, { status: 400 });
	}

	const model = env.DEEPGRAM_MODEL || 'nova-3';
	const query = new URLSearchParams({
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
		language: env.DEEPGRAM_LANGUAGE || 'en'
	});

	try {
		const deepgramResponse = await fetch(`https://api.deepgram.com/v1/listen?${query}`, {
			method: 'POST',
			headers: {
				Authorization: `Token ${apiKey}`,
				'Content-Type': request.headers.get('content-type') || 'application/octet-stream'
			},
			body
		});

		const text = await deepgramResponse.text();
		return new Response(text, {
			status: deepgramResponse.status,
			headers: {
				'Content-Type': deepgramResponse.headers.get('content-type') || 'application/json'
			}
		});
	} catch (error) {
		return json(
			{ ok: false, error: error instanceof Error ? error.message : 'Deepgram proxy failed.' },
			{ status: 502 }
		);
	}
}
