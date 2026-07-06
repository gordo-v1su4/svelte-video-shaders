import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';

/** Expose DEEPGRAM_* server env to the client bundle (same key, no duplicate VITE_ var). */
function deepgramClientEnv(mode) {
	const env = loadEnv(mode, process.cwd(), '');
	const apiKey = env.VITE_DEEPGRAM_API_KEY || env.DEEPGRAM_API_KEY || '';
	const model = env.VITE_DEEPGRAM_MODEL || env.DEEPGRAM_MODEL || '';
	const language = env.VITE_DEEPGRAM_LANGUAGE || env.DEEPGRAM_LANGUAGE || '';
	/** @type {Record<string, string>} */
	const define = {};
	if (apiKey) define['import.meta.env.VITE_DEEPGRAM_API_KEY'] = JSON.stringify(apiKey);
	if (model) define['import.meta.env.VITE_DEEPGRAM_MODEL'] = JSON.stringify(model);
	if (language) define['import.meta.env.VITE_DEEPGRAM_LANGUAGE'] = JSON.stringify(language);
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
