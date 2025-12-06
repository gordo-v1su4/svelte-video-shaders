/**
 * Audio Analysis Service - Calls Python Essentia API for beat detection
 * 
 * API URL can be configured via environment variable:
 * - VITE_ESSENTIA_API_URL (defaults to http://localhost:8000)
 * - For production, set this to your deployed API URL
 * 
 * To set: Create a .env file in the project root with:
 *   VITE_ESSENTIA_API_URL=http://your-api-server:8000
 */

// SvelteKit/Vite public env vars are available at build time
const API_URL = import.meta.env.VITE_ESSENTIA_API_URL || 'http://localhost:8000';

// Log the API URL on module load to verify it's set correctly
console.log(`[EssentiaService] Module loaded. API_URL: ${API_URL}`);
console.log(`[EssentiaService] Environment variable VITE_ESSENTIA_API_URL:`, import.meta.env.VITE_ESSENTIA_API_URL);

export class EssentiaService {
    constructor() {
        this.isReady = false;
    }

    async initialize() {
        // Check if API is available
        console.log(`[EssentiaService] Initializing with API URL: ${API_URL}`);
        try {
            const response = await fetch(`${API_URL}/health`);
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
     * Analyzes an audio file for beats and BPM via the API.
     * @param {File} audioFile - The audio file to analyze
     * @returns {Promise<{bpm: number, beats: number[], confidence: number}>}
     */
    async analyzeFile(audioFile) {
        if (!this.isReady) {
            console.warn('[EssentiaService] ⚠️ API not available, returning empty analysis');
            return { bpm: 0, beats: [], confidence: 0 };
        }

        console.log(`[EssentiaService] 📤 Sending audio file to ${API_URL}/analyze`);
        console.log(`[EssentiaService] File: ${audioFile.name}, Size: ${(audioFile.size / 1024).toFixed(2)} KB`);

        const formData = new FormData();
        formData.append('file', audioFile);

        try {
            const startTime = performance.now();
            const response = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                body: formData
            });

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[EssentiaService] ❌ API error (${response.status}):`, errorText);
                throw new Error(`API error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log(`[EssentiaService] ✅ Analysis complete in ${elapsed}s:`, result);
            console.log(`[EssentiaService] BPM: ${result.bpm}, Beats: ${result.beats?.length || 0}, Confidence: ${result.confidence}`);
            return result;
        } catch (e) {
            console.error('[EssentiaService] ❌ Analysis failed:', e);
            return { bpm: 0, beats: [], confidence: 0 };
        }
    }

    // Legacy method signature for compatibility
    analyze(audioBuffer) {
        console.warn('analyze(audioBuffer) is deprecated, use analyzeFile(file) instead');
        return { bpm: 0, beats: [], confidence: 0 };
    }
}
