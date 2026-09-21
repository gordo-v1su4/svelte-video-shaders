import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { callKimiStoryEngine } from '$lib/kimi-story-engine.js';

/**
 * Kimi/Moonshot story generation bridge. Receives lyric chunks + a local
 * story plan and returns AI-generated story beats. Keys stay server-side;
 * failures degrade gracefully so the client falls back to local prompts.
 */
export async function POST({ request }) {
	const apiKey = env.KIMI_API_KEY || env.MOONSHOT_API_KEY;
	const apiBase =
		env.KIMI_API_BASE ||
		(apiKey?.startsWith('sk-kimi-') ? 'https://api.kimi.com/coding' : 'https://api.moonshot.ai/v1');
	const apiProtocol =
		env.KIMI_API_PROTOCOL || (apiBase.includes('api.kimi.com/coding') ? 'anthropic' : 'openai');
	const configuredModel = env.KIMI_MODEL;
	const model =
		apiProtocol === 'anthropic' && (!configuredModel || configuredModel === 'kimi-k2.6')
			? 'kimi-for-coding'
			: configuredModel || (apiProtocol === 'anthropic' ? 'kimi-for-coding' : 'kimi-k2.6');

	if (!apiKey) {
		return json({
			success: false,
			ok: false,
			error:
				'KIMI_API_KEY or MOONSHOT_API_KEY is not configured. Local prompts are still available.'
		});
	}

	try {
		const body = await request.json();
		const payload = await callKimiStoryEngine({
			apiKey,
			apiBase,
			apiProtocol,
			model,
			chunks: body.chunks || [],
			storyPlan: body.storyPlan || null
		});
		return json(payload);
	} catch (error) {
		return json({
			success: false,
			ok: false,
			provider: 'kimi',
			error:
				error instanceof Error
					? error.message
					: 'Kimi story engine unavailable; local prompts are still available.'
		});
	}
}
