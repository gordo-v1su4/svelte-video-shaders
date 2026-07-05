import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
	return {
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
