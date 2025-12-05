import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			// Generate a fallback page for client-side routing
			fallback: 'index.html',
			// Strict mode - all routes must be prerenderable
			strict: true
		})
	}
};

export default config;
