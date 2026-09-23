import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ESSENTIA_API_URL,
	clientToken,
	isClientSafeToken,
	sanitizePublicHttpUrl,
	sealClientEnv
} from './public-env.js';

const ENV_FILE_PASTE = [
	'VITE_ESSENTIA_API_KEY=placeholder-essentia',
	'ESSENTIA_API_KEY=placeholder-essentia',
	'',
	'# Deepgram (server /api/transcribe)',
	'DEEPGRAM_API_KEY=placeholder-deepgram',
	'DEEPGRAM_MODEL=nova-3',
	'',
	'# Kimi / Moonshot (server /api/story)',
	'KIMI_API_KEY=placeholder-kimi',
	'KIMI_MODEL=kimi-for-coding'
].join('\n');

describe('sanitizePublicHttpUrl', () => {
	it('keeps a real https URL', () => {
		expect(sanitizePublicHttpUrl('https://essentia.v1su4.dev')).toBe('https://essentia.v1su4.dev');
		expect(sanitizePublicHttpUrl('https://example.com/api/')).toBe('https://example.com/api');
	});

	it('rewrites the legacy essentia hostname', () => {
		expect(sanitizePublicHttpUrl('https://essentia.v1su4.com')).toBe('https://essentia.v1su4.dev');
	});

	it('replaces a pasted env file with the default URL', () => {
		const safe = sanitizePublicHttpUrl(ENV_FILE_PASTE);
		expect(safe).toBe(DEFAULT_ESSENTIA_API_URL);
		expect(safe).not.toContain('placeholder');
		expect(safe).not.toContain('API_KEY');
	});

	it('uses the default when the value is empty or not a URL', () => {
		expect(sanitizePublicHttpUrl('')).toBe(DEFAULT_ESSENTIA_API_URL);
		expect(sanitizePublicHttpUrl(undefined)).toBe(DEFAULT_ESSENTIA_API_URL);
		expect(sanitizePublicHttpUrl('not a url')).toBe(DEFAULT_ESSENTIA_API_URL);
	});
});

describe('client tokens', () => {
	it('keeps a single-line token unchanged', () => {
		expect(isClientSafeToken('placeholder-token')).toBe(true);
		expect(clientToken('placeholder-token')).toBe('placeholder-token');
		expect(clientToken('nova-3')).toBe('nova-3');
		expect(clientToken('dGVzdA==')).toBe('dGVzdA==');
	});

	it('drops an env-file paste', () => {
		expect(isClientSafeToken(ENV_FILE_PASTE)).toBe(false);
		expect(clientToken(ENV_FILE_PASTE)).toBe('');
		expect(clientToken('DEEPGRAM_API_KEY=placeholder-deepgram')).toBe('');
	});
});

describe('sealClientEnv', () => {
	it('does not change a valid URL or token', () => {
		const env = {
			VITE_ESSENTIA_API_URL: 'https://essentia.v1su4.dev',
			VITE_ESSENTIA_API_KEY: 'placeholder-token',
			DEEPGRAM_API_KEY: 'server-token-stays',
			KIMI_API_KEY: 'server-kimi-stays'
		};

		sealClientEnv(env);

		expect(env.VITE_ESSENTIA_API_URL).toBe('https://essentia.v1su4.dev');
		expect(env.VITE_ESSENTIA_API_KEY).toBe('placeholder-token');
		expect(env.DEEPGRAM_API_KEY).toBe('server-token-stays');
		expect(env.KIMI_API_KEY).toBe('server-kimi-stays');
	});

	it('strips a pasted env file from client vars and leaves server keys alone', () => {
		const env = {
			VITE_ESSENTIA_API_URL: ENV_FILE_PASTE,
			VITE_DEEPGRAM_API_KEY: ENV_FILE_PASTE,
			DEEPGRAM_API_KEY: 'server-token-stays',
			KIMI_API_KEY: 'server-kimi-stays'
		};

		sealClientEnv(env);

		expect(env.VITE_ESSENTIA_API_URL).toBe(DEFAULT_ESSENTIA_API_URL);
		expect(env.VITE_ESSENTIA_API_URL).not.toContain('placeholder');
		expect(env.VITE_DEEPGRAM_API_KEY).toBe('');
		expect(env.DEEPGRAM_API_KEY).toBe('server-token-stays');
		expect(env.KIMI_API_KEY).toBe('server-kimi-stays');
	});
});
