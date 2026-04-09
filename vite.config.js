import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { playwright } from '@vitest/browser-playwright';

// Rollup warns on misplaced /* @__PURE__ */ before Symbol() in svelte-tweakpane-ui dist; strip before Svelte compile.
function stripTweakpaneGenericBindingPure() {
	return {
		name: 'strip-tweakpane-genericbinding-pure',
		enforce: 'pre',
		transform(code, id) {
			const path = id.split('\\').join('/');
			if (!path.includes('svelte-tweakpane-ui/dist/internal/GenericBinding.svelte')) return null;
			if (!code.includes('@__PURE__')) return null;
			const next = code.replace(
				/const\s+key\s*=\s*\/\*\s*@__PURE__\s*\*\/\s*Symbol\('key'\)/,
				"const key = Symbol('key')"
			);
			return next === code ? null : { code: next, map: null };
		}
	};
}

export default defineConfig(({ ssrBuild }) => ({
	plugins: [
		stripTweakpaneGenericBindingPure(),
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
	optimizeDeps: {
		exclude: ['mp4box'] // Prevent Vite from pre-bundling mp4box (required for ESM compatibility)
	},
	build: {
		chunkSizeWarningLimit: 1500,
		rollupOptions: {
			// Only apply manualChunks to the client build; SSR treats some deps as external
			...(ssrBuild
				? {}
				: {
						output: {
							manualChunks: {
								// three is often external in SSR; split only tweakpane here
								tweakpane: ['svelte-tweakpane-ui']
							}
						}
					})
		}
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
					exclude: [
						'src/**/*.svelte.{test,spec}.{js,ts}',
						'src/temp_backup/**',
						'src/**/page.svelte.test.js'
					]
				}
			}
		]
	}
}));