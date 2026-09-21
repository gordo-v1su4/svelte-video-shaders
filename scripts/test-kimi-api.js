#!/usr/bin/env bun
/**
 * Quick Kimi API probe. Loads KIMI_API_KEY / MOONSHOT_API_KEY from env or .env.
 * Usage: bun scripts/test-kimi-api.js
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFile(path) {
	if (!existsSync(path)) return;
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!process.env[key]) process.env[key] = value;
	}
}

loadEnvFile(resolve('.env'));
loadEnvFile(resolve('.env.local'));

const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
const isCodeKey = apiKey?.startsWith('sk-kimi-');
const model =
	process.env.KIMI_MODEL || (isCodeKey ? 'kimi-for-coding' : 'kimi-k3');
const protocol = process.env.KIMI_API_PROTOCOL || (isCodeKey ? 'anthropic' : 'openai');
const bases = [
	process.env.KIMI_API_BASE?.replace(/\/$/, '') || null,
	isCodeKey ? 'https://api.kimi.com/coding' : 'https://api.moonshot.ai/v1',
	'https://api.moonshot.cn/v1'
].filter(Boolean);

if (!apiKey) {
	console.error('Missing KIMI_API_KEY or MOONSHOT_API_KEY in .env');
	process.exit(1);
}

async function probeAnthropic(base) {
	const normalized = base.replace(/\/$/, '');
	const url = normalized.endsWith('/v1') ? `${normalized}/messages` : `${normalized}/v1/messages`;
	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'x-api-key': apiKey,
			'anthropic-version': '2023-06-01',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model,
			max_tokens: 256,
			messages: [{ role: 'user', content: 'Reply with exactly: {"ok":true,"probe":"kimi-code"}' }]
		})
	});
	const text = await response.text();
	let payload = {};
	try {
		payload = text ? JSON.parse(text) : {};
	} catch {
		payload = { raw: text.slice(0, 400) };
	}
	const content = Array.isArray(payload.content)
		? payload.content.map((part) => part?.text || '').join('')
		: payload.content;
	return {
		protocol: 'anthropic',
		base,
		status: response.status,
		model: payload.model,
		content: content?.slice(0, 240) || null,
		usage: payload.usage || null,
		error: payload.error?.message || payload.message || null
	};
}

async function probeOpenAi(base) {
	const url = `${base.replace(/\/$/, '')}/chat/completions`;
	const body = {
		model,
		reasoning_effort: 'low',
		messages: [
			{
				role: 'user',
				content: 'Reply with exactly: {"ok":true,"probe":"kimi"}'
			}
		],
		response_format: { type: 'json_object' },
		max_completion_tokens: 256
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(body)
	});

	const text = await response.text();
	let payload = {};
	try {
		payload = text ? JSON.parse(text) : {};
	} catch {
		payload = { raw: text.slice(0, 400) };
	}

	return {
		protocol: 'openai',
		base,
		status: response.status,
		model: payload.model,
		content: payload.choices?.[0]?.message?.content?.slice(0, 240) || null,
		usage: payload.usage || null,
		error: payload.error?.message || payload.message || null
	};
}

console.log(
	`Testing Kimi API (protocol=${protocol}, model=${model}, key prefix=${apiKey.slice(0, 8)}...)`
);

const probe = protocol === 'anthropic' ? probeAnthropic : probeOpenAi;

for (const base of [...new Set(bases)]) {
	try {
		const result = await probe(base);
		console.log(JSON.stringify(result, null, 2));
		if (result.status === 200) process.exit(0);
	} catch (error) {
		console.log(JSON.stringify({ base, error: error instanceof Error ? error.message : String(error) }, null, 2));
	}
}

process.exit(1);
