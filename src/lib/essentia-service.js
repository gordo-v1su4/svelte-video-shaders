/**
 * Audio Analysis Service - Calls Python Essentia API for beat detection
 *
 * Public build-time env (Vite inlines `VITE_*` into the browser bundle):
 * - VITE_ESSENTIA_API_URL — single https URL, default https://essentia.v1su4.dev
 * - VITE_ESSENTIA_API_KEY — optional single-line token
 *
 * Values that are not a URL or a single token are ignored. They are never logged.
 */

import { clientToken, sanitizePublicHttpUrl } from '$lib/public-env.js';

const API_URL = sanitizePublicHttpUrl(import.meta.env.VITE_ESSENTIA_API_URL);
const API_KEY = clientToken(import.meta.env.VITE_ESSENTIA_API_KEY);

/**
 * Build fetch options with optional API key header
 * @param {RequestInit} options - Base fetch options
 * @param {boolean} includeApiKey - Whether to include API key header
 * @returns {RequestInit} - Fetch options with API key header if configured
 */
function buildFetchOptions(options = {}, includeApiKey = true) {
	const headers = new Headers(options.headers || {});
	if (includeApiKey && API_KEY) {
		headers.set('X-API-Key', API_KEY);
	}
	return { ...options, headers };
}

export class EssentiaService {
	constructor() {
		this.isReady = false;
	}

	async initialize() {
		try {
			// Keep health check simple/public (no auth header needed).
			const response = await fetch(`${API_URL}/health`, buildFetchOptions({}, false));
			if (response.ok) {
				this.isReady = true;
			} else {
				console.warn(`[EssentiaService] API health check failed: ${response.status}`);
			}
		} catch {
			console.warn('[EssentiaService] API not available');
		}
	}

	/**
	 * Analyzes an audio file for beats, BPM, onsets, and song structure via the API.
	 *
	 * Endpoint: POST /analyze/fast (see https://essentia.v1su4.dev/docs)
	 * - **fast** — shorter jobs we actually need (BPM, beats, onsets, structure/sections).
	 *   Structure labels are not perfect; client-side `postProcessSections()` relabels/splits them.
	 * - **full** — superset of slower endpoints (classification, tonal, etc.) we do not use yet.
	 *
	 * Do not switch to /analyze/full unless you need extra fields; structure already comes from fast.
	 * @param {File} audioFile - The audio file to analyze
	 * @returns {Promise<{bpm: number, beats: number[], confidence: number, onsets: number[], duration: number, structure: object, classification?: object, tonal?: object}>}
	 */
	async analyzeFile(audioFile) {
		if (!this.isReady) {
			console.warn(
				'[EssentiaService] ⚠️ API health check did not pass, attempting analysis request anyway'
			);
		}

		console.log(
			`[EssentiaService] File: ${audioFile.name}, Size: ${(audioFile.size / 1024).toFixed(2)} KB`
		);

		const formData = new FormData();
		formData.append('file', audioFile);

		try {
			const startTime = performance.now();
			const response = await fetch(
				`${API_URL}/analyze/fast`,
				buildFetchOptions({
					method: 'POST',
					body: formData
				})
			);

			const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

			if (!response.ok) {
				const errorText = await response.text();
				console.error(`[EssentiaService] ❌ API error (${response.status}):`, errorText);
				throw new Error(`API error: ${response.status} - ${errorText}`);
			}

			const result = await response.json();
			console.log(`[EssentiaService] ✅ Analysis complete in ${elapsed}s:`, result);
			console.log(
				`[EssentiaService] BPM: ${result.bpm}, Beats: ${result.beats?.length || 0}, Onsets: ${result.onsets?.length || 0}, Confidence: ${result.confidence}`
			);
			console.log(
				`[EssentiaService] Structure: ${result.structure?.sections?.length || 0} sections, Classification: ${result.classification ? 'available' : 'none'}`
			);

			// Verify energy curve is present (for speed ramping)
			if (result.energy?.curve) {
				console.log(
					`[EssentiaService] ✅ Energy curve available: ${result.energy.curve.length} samples (mean: ${result.energy.mean?.toFixed(3)}, std: ${result.energy.std?.toFixed(3)})`
				);
			} else {
				console.warn(
					`[EssentiaService] ⚠️ Energy curve not available in API response - speed ramping will not work`
				);
			}

			return result;
		} catch (e) {
			console.error('[EssentiaService] ❌ Analysis failed:', e);
			throw e instanceof Error ? e : new Error(String(e));
		}
	}

	// Legacy method signature for compatibility
	analyze(_audioBuffer) {
		console.warn('analyze(audioBuffer) is deprecated, use analyzeFile(file) instead');
		return { bpm: 0, beats: [], confidence: 0 };
	}
}
