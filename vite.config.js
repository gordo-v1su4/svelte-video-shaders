import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ ssrBuild }) => ({
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
	optimizeDeps: {
		exclude: ['mp4box'] // Prevent Vite from pre-bundling mp4box (required for ESM compatibility)
	},
	build: {
		chunkSizeWarningLimit: 1500,
		// Only apply manualChunks to the client build; SSR treats some deps as external
		...(ssrBuild
			? {}
			: {
				rollupOptions: {
					output: {
						manualChunks: (id) => {
							// Normalize path separators for cross-platform compatibility
							const normalizedId = id.replace(/\\/g, '/');
							
							// Split large dependencies into separate vendor chunks
							// Check for node_modules first
							if (!normalizedId.includes('node_modules')) {
								// Split application code by route/feature
								if (normalizedId.includes('src/lib/VideoWorkbench')) {
									return 'app-workbench';
								}
								if (normalizedId.includes('src/lib/PeaksPlayer')) {
									return 'app-peaks';
								}
								if (normalizedId.includes('src/lib/ShaderPlayer')) {
									return 'app-shader';
								}
								// Other app code stays together
								return;
							}
							
							// Three.js - large 3D library (check for package name)
							if (normalizedId.includes('/three') && !normalizedId.includes('/three-')) {
								return 'vendor-three';
							}
							
							// Peaks.js - audio waveform library
							if (normalizedId.includes('/peaks.js')) {
								return 'vendor-peaks';
							}
							
							// Essentia.js - audio analysis library
							if (normalizedId.includes('/essentia.js')) {
								return 'vendor-essentia';
							}
							
							// Clerk - authentication library
							if (normalizedId.includes('/@clerk/')) {
								return 'vendor-clerk';
							}
							
							// Tweakpane - UI controls library
							if (normalizedId.includes('/svelte-tweakpane-ui') ||
							    normalizedId.includes('/tweakpane')) {
								return 'vendor-tweakpane';
							}
							
							// UI libraries (bits-ui, tailwind-merge, clsx, etc.)
							if (normalizedId.includes('/bits-ui/') ||
							    normalizedId.includes('/tailwind-merge/') ||
							    normalizedId.includes('/clsx/') ||
							    normalizedId.includes('/tailwind-variants/')) {
								return 'vendor-ui';
							}
							
							// Media libraries
							if (normalizedId.includes('/mediabunny/') ||
							    normalizedId.includes('/mp4box')) {
								return 'vendor-media';
							}
							
							// SvelteKit and Svelte core
							if (normalizedId.includes('/@sveltejs/') ||
							    normalizedId.includes('/svelte/')) {
								return 'vendor-svelte';
							}
							
							// Other node_modules go into vendor chunk
							return 'vendor';
						}
					}
				}
			})
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