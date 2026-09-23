/** Default Essentia base when `VITE_ESSENTIA_API_URL` is missing or not a URL. */
export const DEFAULT_ESSENTIA_API_URL = 'https://essentia.v1su4.dev';

/**
 * Public client values must be a single http(s) URL.
 * A pasted env file (newlines, KEY=value lines) is rejected so it is never
 * inlined into the bundle, logged, or sent as a request path.
 * @param {unknown} raw
 * @param {string} [fallback]
 * @returns {string}
 */
export function sanitizePublicHttpUrl(raw, fallback = DEFAULT_ESSENTIA_API_URL) {
	if (typeof raw !== 'string') return fallback;
	const trimmed = raw.trim();
	if (!trimmed || /[\s#]/.test(trimmed) || trimmed.includes('=')) return fallback;

	let parsed;
	try {
		parsed = new URL(trimmed);
	} catch {
		return fallback;
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
	if (parsed.username || parsed.password) return fallback;

	parsed.hostname = parsed.hostname.replace(/essentia\.v1su4\.com$/i, 'essentia.v1su4.dev');
	parsed.hash = '';
	parsed.search = '';

	const value = parsed.toString().replace(/\/$/, '');
	return value || fallback;
}

/**
 * True for a single-line client token (API key, model id).
 * Rejects env-file pastes. Does not alter a value that already passes.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isClientSafeToken(raw) {
	if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return false;
	if (/[\s#]/.test(raw)) return false;
	if (/_(?:KEY|URL|MODEL|BASE|PROTOCOL)=/.test(raw)) return false;
	return true;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function clientToken(raw) {
	return isClientSafeToken(raw) ? raw : '';
}

/**
 * Rewrite unsafe `VITE_*` values before Vite inlines them into client JS.
 * Server-only keys (no `VITE_` prefix) are left untouched.
 * A valid URL or token is kept as-is, aside from Essentia host/slash normalization.
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function sealClientEnv(env) {
	const urlKey = 'VITE_ESSENTIA_API_URL';
	const safeUrl = sanitizePublicHttpUrl(env[urlKey], DEFAULT_ESSENTIA_API_URL);
	if (env[urlKey] !== safeUrl) env[urlKey] = safeUrl;

	for (const key of Object.keys(env)) {
		if (!key.startsWith('VITE_') || key === urlKey) continue;
		const value = env[key];
		if (typeof value !== 'string' || value === '') continue;
		if (!isClientSafeToken(value)) env[key] = '';
	}

	return env;
}
