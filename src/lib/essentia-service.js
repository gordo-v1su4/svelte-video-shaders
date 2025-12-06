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

export class EssentiaService {
    constructor() {
        this.isReady = false;
    }

    async initialize() {
        // Check if API is available
        try {
            const response = await fetch(`${API_URL}/health`);
            if (response.ok) {
                this.isReady = true;
                console.log('Essentia API connected');
            }
        } catch (e) {
            console.warn('Essentia API not available:', e.message);
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
            console.warn('Essentia API not available, returning empty analysis');
            return { bpm: 0, beats: [], confidence: 0 };
        }

        const formData = new FormData();
        formData.append('file', audioFile);

        try {
            const response = await fetch(`${API_URL}/analyze`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const result = await response.json();
            console.log('Analysis result:', result);
            return result;
        } catch (e) {
            console.error('Analysis failed:', e);
            return { bpm: 0, beats: [], confidence: 0 };
        }
    }

    // Legacy method signature for compatibility
    analyze(audioBuffer) {
        console.warn('analyze(audioBuffer) is deprecated, use analyzeFile(file) instead');
        return { bpm: 0, beats: [], confidence: 0 };
    }
}
