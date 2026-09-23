import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';
import {
	DEFAULT_ESSENTIA_API_URL,
	isClientSafeToken,
	sanitizePublicHttpUrl,
	sealClientEnv
} from './src/lib/public-env.js';

/** Expose DEEPGRAM_* server env to the client bundle (same key, no duplicate VITE_ var). */
function deepgramClientEnv(mode) {
	const env = loadEnv(mode, process.cwd(), '');
	// Drop pasted env-file blobs before Vite copies VITE_* into the browser bundle.
	// loadEnv already merged files with process.env; write the sealed VITE_* values
	// back so a bad Vercel value cannot win over this.
	sealClientEnv(env);
	for (const key of Object.keys(env)) {
		if (!key.startsWith('VITE_')) continue;
		if (process.env[key] !== env[key]) process.env[key] = env[key];
	}
	const apiKey = env.VITE_DEEPGRAM_API_KEY || env.DEEPGRAM_API_KEY || '';
	const model = env.VITE_DEEPGRAM_MODEL || env.DEEPGRAM_MODEL || '';
	const language = env.VITE_DEEPGRAM_LANGUAGE || env.DEEPGRAM_LANGUAGE || '';
	/** @type {Record<string, string>} */
	const define = {};
	define['import.meta.env.VITE_ESSENTIA_API_URL'] = JSON.stringify(
		sanitizePublicHttpUrl(env.VITE_ESSENTIA_API_URL, DEFAULT_ESSENTIA_API_URL)
	);
	if (isClientSafeToken(apiKey)) {
		define['import.meta.env.VITE_DEEPGRAM_API_KEY'] = JSON.stringify(apiKey);
	}
	if (isClientSafeToken(model)) {
		define['import.meta.env.VITE_DEEPGRAM_MODEL'] = JSON.stringify(model);
	}
	if (isClientSafeToken(language)) {
		define['import.meta.env.VITE_DEEPGRAM_LANGUAGE'] = JSON.stringify(language);
	}
	return define;
}

export default defineConfig(({ mode }) => {
	return {
		define: deepgramClientEnv(mode),
		plugins: [
			tailwindcss(),
			sveltekit(),
			{
				name: 'configure-response-headers',
				configureServer: (server) => {
					server.middlewares.use((_req, res, next) => {
						res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
						res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
						next();
					});
				}
			}
		],
		build: {
			chunkSizeWarningLimit: 1500
		},
		server: {
			port: 5173,
			strictPort: true // Exit if port is already in use instead of trying another port
		},
		test: {
			projects: [
				{
					extends: './vite.config.js',
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [{ browser: 'chromium' }]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**', 'src/demo.spec.js'],
						setupFiles: ['./vitest-setup-client.js']
					}
				},
				{
					extends: './vite.config.js',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/page.svelte.test.js']
					}
				}
			]
		}
	};
});
