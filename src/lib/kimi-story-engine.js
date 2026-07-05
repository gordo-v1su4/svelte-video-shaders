export const KIMI_STORY_ENDPOINT = '/api/story';
export const KIMI_STORY_MODEL = 'kimi-k2.6';
export const KIMI_CODE_MODEL = 'kimi-for-coding';

function cleanText(value, maxLength = 4000) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, maxLength);
}

function extractJsonObject(text) {
	const trimmed = String(text || '').trim();
	if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	if (fence) return extractJsonObject(fence);
	const start = trimmed.indexOf('{');
	const end = trimmed.lastIndexOf('}');
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
	return trimmed;
}

function safeJsonParse(text) {
	try {
		return JSON.parse(extractJsonObject(text));
	} catch {
		return null;
	}
}

function clampNumber(value, fallback, min, max) {
	const number = Number(value);
	if (!Number.isFinite(number)) return fallback;
	return Math.max(min, Math.min(max, number));
}

function normalizeChunks(chunks = [], storyPlan = null) {
	const source =
		Array.isArray(storyPlan?.chunks) && storyPlan.chunks.length ? storyPlan.chunks : chunks;
	return (Array.isArray(source) ? source : [])
		.map((chunk, index) => {
			const start = Number(chunk.start) || 0;
			const end = Number(chunk.end) || start + 6;
			return {
				index: Number(chunk.index) || index + 1,
				start,
				end: Math.max(end, start + 1),
				text: cleanText(chunk.text, 700),
				sectionLabel: chunk.sectionLabel || chunk.section || 'song',
				mood: chunk.mood || 'cinematic',
				prompt: cleanText(chunk.prompt, 900),
				imagePrompt: cleanText(chunk.imagePrompt, 1000)
			};
		})
		.filter((chunk) => chunk.text || chunk.prompt || chunk.imagePrompt)
		.slice(0, 12);
}

function chunkLinesForPrompt(chunks) {
	return chunks
		.map(
			(chunk) =>
				`${chunk.index}. ${chunk.start.toFixed(2)}s-${chunk.end.toFixed(2)}s [${chunk.sectionLabel}] ${chunk.text || chunk.prompt}`
		)
		.join('\n');
}

export function buildKimiStoryPrompt({ chunks = [], storyPlan = null } = {}) {
	const normalizedChunks = normalizeChunks(chunks, storyPlan);
	const title = cleanText(storyPlan?.title, 120) || 'Lyric Film';
	const logline = cleanText(storyPlan?.logline, 260);
	const seed = cleanText(storyPlan?.seed, 1600);
	const direction = storyPlan?.storyDirection;
	const directionText = direction
		? [
				`Selected direction: ${cleanText(direction.label, 120)}.`,
				`Style: ${cleanText(direction.style, 260)}.`,
				`Character: ${cleanText(direction.character, 260)}.`,
				`World: ${cleanText(direction.world, 260)}.`,
				`Creative directive: ${cleanText(direction.promptDirection, 600)}.`
			].join('\n')
		: '';
	const targetBeatCount = Math.max(2, normalizedChunks.length || 2);
	const beatContract = normalizedChunks.length
		? `Use these timed Deepgram/SRT chunks as the beat source. Keep beat timing aligned when possible:\n${chunkLinesForPrompt(normalizedChunks)}`
		: 'No timed chunks were supplied. Create 4 concise music-video beats from the available premise.';

	return `Create a production-ready cinematic music-video story plan from lyrics and timing.

Project title: ${title}
Existing logline: ${logline || '(none)'}
Local story seed and analysis cues:
${seed || '(none)'}
${directionText ? `\n${directionText}` : ''}

${beatContract}

Return ONE valid JSON object only. No markdown, no code fences.
Schema:
{
  "story_title": "short evocative title",
  "story_logline": "one sentence under 30 words",
  "story_seed": "2-3 sentence through-line for the whole video",
  "beats": [
    {
      "label": "section or scene label",
      "chunk_index": 1,
      "start": 0,
      "end": 6,
      "lyric_excerpt": "timed lyric text",
      "scene_description": "2-3 vivid sentences with action, world, character continuity, and emotional progression",
      "duration_seconds": 6,
      "sub_beat_count": 1,
      "keyframe_prompts": ["exactly 9 prompts for a 3x3 storyboard sheet"]
    }
  ]
}

Rules:
- Generate ${targetBeatCount} beats, preferably one per timed lyric chunk.
- Each keyframe prompt is 30-55 words and includes camera angle, lighting, subject action, atmosphere, and how it cuts to adjacent beats.
- Exactly 9 keyframe_prompts per beat unless a beat truly needs 18 or 27; set sub_beat_count to prompts/9.
- Keep story continuity across beats; do not make disconnected lyric illustrations.
- Honor the selected direction as the creative north star; do not blend all three possible story lanes.
- Make prompts directly usable for image/video generation.`;
}

function normalizeKeyframes(prompts, fallbackPrompt, subBeatCount = 1) {
	const target = clampNumber(subBeatCount, 1, 1, 3) * 9;
	const cleaned = (Array.isArray(prompts) ? prompts : [])
		.map((prompt) => cleanText(prompt, 700))
		.filter(Boolean)
		.slice(0, 27);
	while (cleaned.length < target) {
		const shotNumber = cleaned.length + 1;
		cleaned.push(
			`${fallbackPrompt} Storyboard frame ${shotNumber}: cinematic camera angle, expressive lighting, clear subject action, rhythmic motion, and continuity with the surrounding lyric beats.`
		);
	}
	return cleaned.slice(0, target);
}

export function normalizeKimiStoryResponse(
	raw,
	{ chunks = [], storyPlan = null, model = KIMI_STORY_MODEL, usage = null } = {}
) {
	const parsed = typeof raw === 'string' ? safeJsonParse(raw) : raw;
	if (!parsed || typeof parsed !== 'object') {
		throw new Error('Kimi returned non-JSON story output.');
	}
	const normalizedChunks = normalizeChunks(chunks, storyPlan);
	const beatSource = Array.isArray(parsed.beats) ? parsed.beats : [];
	const beats = beatSource
		.slice(0, Math.max(2, normalizedChunks.length || beatSource.length || 2))
		.map((beat, index) => {
			const chunk =
				normalizedChunks[index] ||
				normalizedChunks.find((item) => item.index === Number(beat.chunk_index));
			const start = Number.isFinite(Number(beat.start))
				? Number(beat.start)
				: chunk?.start || index * 6;
			const end = Number.isFinite(Number(beat.end)) ? Number(beat.end) : chunk?.end || start + 6;
			const duration = clampNumber(beat.duration_seconds, Math.max(1, end - start), 1, 60);
			const subBeatCount = clampNumber(beat.sub_beat_count, 1, 1, 3);
			const fallbackPrompt = cleanText(
				beat.scene_description ||
					chunk?.imagePrompt ||
					chunk?.prompt ||
					chunk?.text ||
					`Beat ${index + 1}`,
				500
			);
			return {
				id: `kimi-beat-${index + 1}`,
				index,
				label: cleanText(beat.label, 100) || chunk?.sectionLabel || `Beat ${index + 1}`,
				chunk_index: Number(beat.chunk_index) || chunk?.index || index + 1,
				start,
				end: Math.max(end, start + 1),
				lyric_excerpt: cleanText(beat.lyric_excerpt || chunk?.text, 500),
				scene_description: cleanText(beat.scene_description || fallbackPrompt, 1300),
				duration_seconds: duration,
				sub_beat_count: subBeatCount,
				keyframe_prompts: normalizeKeyframes(beat.keyframe_prompts, fallbackPrompt, subBeatCount),
				status: 'ready'
			};
		});

	if (beats.length === 0) throw new Error('Kimi returned no usable story beats.');

	return {
		success: true,
		provider: 'kimi',
		model,
		storyId: `kimi-${Date.now()}`,
		title: cleanText(parsed.story_title, 140) || storyPlan?.title || 'Lyric Film',
		logline: cleanText(parsed.story_logline, 280) || storyPlan?.logline || '',
		storySeed: cleanText(parsed.story_seed, 1800) || storyPlan?.seed || '',
		beats,
		usage
	};
}

function normalizeApiBase(base = '') {
	return String(base || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
}

function kimiCodingMessagesUrl(apiBase) {
	const base = normalizeApiBase(apiBase);
	if (base.endsWith('/v1')) return `${base}/messages`;
	return `${base}/v1/messages`;
}

function moonshotChatCompletionsUrl(apiBase) {
	const base = normalizeApiBase(apiBase);
	if (base.endsWith('/chat/completions')) return base;
	return `${base}/chat/completions`;
}

function readAnthropicText(payload) {
	const content = payload?.content;
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.map((part) => (typeof part === 'string' ? part : part?.text || ''))
		.filter(Boolean)
		.join('\n');
}

async function callKimiAnthropicStoryEngine({
	apiKey,
	apiBase,
	model,
	prompt,
	chunks,
	storyPlan,
	fetchImpl
}) {
	const response = await fetchImpl(kimiCodingMessagesUrl(apiBase), {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			system:
				'You are an award-winning music video screenwriter and storyboard director. Return strict JSON only.',
			messages: [{ role: 'user', content: prompt }],
			max_tokens: 12000
		})
	});
	const text = await response.text();
	let payload = {};
	try {
		payload = text ? JSON.parse(text) : {};
	} catch {
		payload = { error: { message: text } };
	}
	if (!response.ok) {
		const message =
			payload?.error?.message ||
			payload?.message ||
			`Kimi story engine failed (${response.status})`;
		throw new Error(message);
	}
	return normalizeKimiStoryResponse(readAnthropicText(payload), {
		chunks,
		storyPlan,
		model: payload?.model || model,
		usage: payload?.usage || null
	});
}

async function callKimiOpenAiStoryEngine({
	apiKey,
	apiBase,
	model,
	prompt,
	chunks,
	storyPlan,
	fetchImpl
}) {
	const response = await fetchImpl(moonshotChatCompletionsUrl(apiBase), {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			messages: [
				{
					role: 'system',
					content:
						'You are an award-winning music video screenwriter and storyboard director. Return strict JSON only.'
				},
				{ role: 'user', content: prompt }
			],
			response_format: { type: 'json_object' },
			thinking: { type: 'disabled' },
			max_completion_tokens: 12000
		})
	});
	const text = await response.text();
	let payload = {};
	try {
		payload = text ? JSON.parse(text) : {};
	} catch {
		payload = { error: { message: text } };
	}
	if (!response.ok) {
		const message =
			payload?.error?.message ||
			payload?.message ||
			`Kimi story engine failed (${response.status})`;
		throw new Error(message);
	}
	const content = payload?.choices?.[0]?.message?.content || '';
	return normalizeKimiStoryResponse(content, {
		chunks,
		storyPlan,
		model: payload?.model || model,
		usage: payload?.usage || null
	});
}

export async function callKimiStoryEngine({
	apiKey,
	apiBase = 'https://api.moonshot.ai/v1',
	apiProtocol = 'openai',
	model = KIMI_STORY_MODEL,
	chunks = [],
	storyPlan = null,
	fetchImpl = fetch
} = {}) {
	if (!apiKey) throw new Error('KIMI_API_KEY or MOONSHOT_API_KEY is not configured.');
	const prompt = buildKimiStoryPrompt({ chunks, storyPlan });
	const protocol = String(apiProtocol || '').toLowerCase();
	const base = normalizeApiBase(apiBase);
	if (protocol === 'anthropic' || base.includes('api.kimi.com/coding')) {
		return callKimiAnthropicStoryEngine({
			apiKey,
			apiBase: base,
			model,
			prompt,
			chunks,
			storyPlan,
			fetchImpl
		});
	}
	return callKimiOpenAiStoryEngine({
		apiKey,
		apiBase: base,
		model,
		prompt,
		chunks,
		storyPlan,
		fetchImpl
	});
}

export async function requestKimiStoryGeneration({
	endpoint = KIMI_STORY_ENDPOINT,
	chunks = [],
	storyPlan = null
} = {}) {
	if (!endpoint) return { ok: false, disabled: true, reason: 'No Kimi story endpoint configured.' };
	const response = await fetch(endpoint, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ chunks, storyPlan })
	});
	const text = await response.text();
	let payload = {};
	try {
		payload = text ? JSON.parse(text) : {};
	} catch {
		payload = { error: text };
	}
	if (!response.ok) {
		return {
			success: false,
			ok: false,
			upstreamStatus: response.status,
			error:
				payload?.error ||
				payload?.reason ||
				payload?.message ||
				`Kimi story endpoint failed (${response.status})`,
			detail: payload
		};
	}
	return payload;
}
