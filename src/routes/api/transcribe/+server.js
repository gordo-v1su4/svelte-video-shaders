import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	buildDeepgramListenQuery,
	DEEPGRAM_LISTEN_URL,
	VERCEL_TRANSCRIBE_BODY_LIMIT
} from '$lib/deepgram-listen.js';

/**
 * Deepgram transcription proxy for small vocal stems. Large files must use
 * browser-direct Deepgram (VITE_DEEPGRAM_API_KEY) — Vercel caps request bodies
 * at ~4.5 MB. Song analysis avoids this by posting straight to Essentia.
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

	if (body.byteLength > VERCEL_TRANSCRIBE_BODY_LIMIT) {
		const mb = Math.round(VERCEL_TRANSCRIBE_BODY_LIMIT / (1024 * 1024));
		return json(
			{
				ok: false,
				error: `Audio is too large for the server proxy (${mb} MB Vercel limit). Set VITE_DEEPGRAM_API_KEY so the browser calls Deepgram directly — same pattern as VITE_ESSENTIA_API_KEY for song analysis.`
			},
			{ status: 413 }
		);
	}

	const query = buildDeepgramListenQuery({
		model: env.DEEPGRAM_MODEL || 'nova-3',
		language: env.DEEPGRAM_LANGUAGE || 'en'
	});

	try {
		const deepgramResponse = await fetch(`${DEEPGRAM_LISTEN_URL}?${query}`, {
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
