import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig(({ ssrBuild }) => ({
	plugins: [
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
						manualChunks: {
							// three is often external in SSR; split only tweakpane here
							tweakpane: ['svelte-tweakpane-ui']
						}
					}
				}
			})
	},
	server: {
		port: 5173,
		strictPort: true // Exit if port is already in use instead of trying another port
	}
}));
