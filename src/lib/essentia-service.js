/**
 * Audio Analysis Service - Calls Python Essentia API for beat detection
 *
 * API URL can be configured via environment variable:
 * - VITE_ESSENTIA_API_URL (defaults to http://localhost:8000)
 * - VITE_ESSENTIA_API_KEY (optional, for authenticated endpoints)
 * - For production, set this to your deployed API URL
 *
 * To set: Create a .env file in the project root with:
 *   VITE_ESSENTIA_API_URL=http://your-api-server:8000
 *   VITE_ESSENTIA_API_KEY=your-api-key-here
 */

// SvelteKit/Vite public env vars are available at build time
const API_URL = import.meta.env.VITE_ESSENTIA_API_URL || 'http://localhost:8000';
const API_KEY = import.meta.env.VITE_ESSENTIA_API_KEY || '';

// Log the API URL on module load to verify it's set correctly
console.log(`[EssentiaService] Module loaded. API_URL: ${API_URL}`);
console.log(`[EssentiaService] API_KEY configured: ${API_KEY ? 'Yes' : 'No'}`);
console.log(`[EssentiaService] Environment variable VITE_ESSENTIA_API_URL:`, import.meta.env.VITE_ESSENTIA_API_URL);
console.log(`[EssentiaService] API Key configured:`, API_KEY ? 'Yes' : 'No');

/**
 * Build fetch options with optional API key header
 * @param {RequestInit} options - Base fetch options
 * @returns {RequestInit} - Fetch options with API key header if configured
 */
function buildFetchOptions(options = {}) {
    const headers = new Headers(options.headers || {});
    if (API_KEY) {
        headers.set('X-API-Key', API_KEY);
    }
    return { ...options, headers };
}

export class EssentiaService {
    constructor() {
        this.isReady = false;
    }

    async initialize() {
        // Check if API is available
        console.log(`[EssentiaService] Initializing with API URL: ${API_URL}`);
        try {
            const response = await fetch(`${API_URL}/health`, buildFetchOptions());
            if (response.ok) {
                this.isReady = true;
                console.log(`[EssentiaService] ✅ API connected successfully at ${API_URL}`);
            } else {
                console.warn(`[EssentiaService] ⚠️ API health check failed: ${response.status} ${response.statusText}`);
            }
        } catch (e) {
            console.warn(`[EssentiaService] ❌ API not available at ${API_URL}:`, e.message);
            console.warn('Start the API with: cd api && uvicorn main:app --reload --port 8000');
        }
    }

    /**
     * Analyzes an audio file for beats, BPM, structure, and classification via the API.
     * Uses the official Essentia API /analyze/full endpoint for complete analysis.
     * @param {File} audioFile - The audio file to analyze
     * @returns {Promise<{bpm: number, beats: number[], confidence: number, onsets: number[], duration: number, structure: object, classification?: object, tonal?: object}>}
     */
    async analyzeFile(audioFile) {
        if (!this.isReady) {
            console.warn('[EssentiaService] ⚠️ API not available, returning empty analysis');
            return { bpm: 0, beats: [], confidence: 0, onsets: [], duration: 0, structure: { sections: [], boundaries: [] } };
        }

        console.log(`[EssentiaService] 📤 Sending audio file to ${API_URL}/analyze/full`);
        console.log(`[EssentiaService] File: ${audioFile.name}, Size: ${(audioFile.size / 1024).toFixed(2)} KB`);

        const formData = new FormData();
        formData.append('file', audioFile);

        try {
            const startTime = performance.now();
            const response = await fetch(`${API_URL}/analyze/full`, buildFetchOptions({
                method: 'POST',
                body: formData
            }));

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[EssentiaService] ❌ API error (${response.status}):`, errorText);
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log(`[EssentiaService] ✅ Analysis complete in ${elapsed}s:`, result);
            console.log(`[EssentiaService] BPM: ${result.bpm}, Beats: ${result.beats?.length || 0}, Onsets: ${result.onsets?.length || 0}, Confidence: ${result.confidence}`);
            console.log(`[EssentiaService] Structure: ${result.structure?.sections?.length || 0} sections, Classification: ${result.classification ? 'available' : 'none'}`);
            
            // Verify energy curve is present (for speed ramping)
            if (result.energy?.curve) {
                console.log(`[EssentiaService] ✅ Energy curve available: ${result.energy.curve.length} samples (mean: ${result.energy.mean?.toFixed(3)}, std: ${result.energy.std?.toFixed(3)})`);
            } else {
                console.warn(`[EssentiaService] ⚠️ Energy curve not available in API response - speed ramping will not work`);
            }
            
            return result;
        } catch (e) {
            console.error('[EssentiaService] ❌ Analysis failed:', e);
            return { bpm: 0, beats: [], confidence: 0, onsets: [], duration: 0, structure: { sections: [], boundaries: [] } };
        }
    }

    // Legacy method signature for compatibility
    analyze(audioBuffer) {
        console.warn('analyze(audioBuffer) is deprecated, use analyzeFile(file) instead');
        return { bpm: 0, beats: [], confidence: 0 };
    }
}
