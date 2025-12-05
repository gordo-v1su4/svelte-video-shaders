// This disables server-side rendering for the entire application.
// It's necessary because the experimental @sveltejs/gl library is not
// fully compatible with SvelteKit's server-side rendering process.
export const ssr = false;

// Enable prerendering for static adapter
export const prerender = true;