"""
Audio Analysis API - Uses Essentia for beat detection and BPM extraction
Run with: uvicorn main:app --reload --port 8000
Or with Docker: docker-compose up
"""
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import essentia.standard as es
import numpy as np
import tempfile
import os

# Environment variables for configuration
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")

app = FastAPI(title="Audio Analysis API", version="1.0.0")

# CORS configuration (supports multiple origins via comma-separated env var)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/analyze")
async def analyze_audio(file: UploadFile = File(...)):
    """
    Analyze uploaded audio file for beats and BPM.
    Returns: { bpm: number, beats: number[], confidence: number }
    """
    # Save uploaded file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        # Load audio with Essentia
        audio = es.MonoLoader(filename=tmp_path, sampleRate=44100)()
        duration = float(len(audio) / 44100)
        
        # Beat detection using RhythmExtractor2013
        rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
        bpm, beats, beats_confidence, _, beats_intervals = rhythm_extractor(audio)
        
        # Onset detection (transients) using OnsetRate
        onset_detector = es.OnsetRate()
        onset_rate = onset_detector(audio)
        
        # For more detailed onset times, use frame-based onset detection
        frame_size = 2048
        hop_size = 512
        frames = es.FrameGenerator(audio, frameSize=frame_size, hopSize=hop_size)
        window = es.Windowing(type='hann')
        spectrum = es.Spectrum()
        onset_detection_alg = es.OnsetRate()
        
        onset_times = []
        frame_index = 0
        prev_energy = None
        
        for frame in frames:
            windowed = window(frame)
            spec = spectrum(windowed)
            # Calculate spectral energy
            energy = np.sum(spec ** 2)
            
            if prev_energy is not None:
                # Detect sudden energy increase (onset/transient)
                energy_diff = energy - prev_energy
                if energy_diff > np.mean(spec) * 0.3:  # Adaptive threshold
                    time = (frame_index * hop_size) / 44100.0
                    if time < duration:  # Ensure we don't exceed duration
                        onset_times.append(time)
            
            prev_energy = energy
            frame_index += 1
        
        # Energy analysis (overall audio energy)
        energy_analyzer = es.Energy()
        energy = energy_analyzer(audio)
        energy_mean = float(np.mean(energy) if hasattr(energy, '__len__') else energy)
        energy_std = float(np.std(energy) if hasattr(energy, '__len__') and len(energy) > 1 else 0.0)
        
        # Spectral centroid (brightness/timbre)
        spectral_centroids = []
        frames_centroid = es.FrameGenerator(audio, frameSize=2048, hopSize=512)
        window_centroid = es.Windowing(type='hann')
        spectrum_centroid = es.Spectrum()
        spectral_centroid_alg = es.SpectralCentroid()
        
        for frame in frames_centroid:
            windowed = window_centroid(frame)
            spec = spectrum_centroid(windowed)
            centroid_val = spectral_centroid_alg(spec)
            spectral_centroids.append(centroid_val)
        
        mean_spectral_centroid = float(np.mean(spectral_centroids)) if spectral_centroids else 0.0
        
        return {
            "bpm": float(bpm),
            "beats": [float(b) for b in beats],  # Beat positions in seconds
            "confidence": float(beats_confidence),
            "duration": duration,
            "onsets": onset_times[:2000] if len(onset_times) > 2000 else onset_times,  # Limit to first 2000 onsets
            "onset_count": len(onset_times),
            "onset_rate": float(onset_rate),
            "energy": {
                "mean": energy_mean,
                "std": energy_std
            },
            "spectral_centroid": mean_spectral_centroid
        }
    finally:
        # Cleanup temp file
        os.unlink(tmp_path)

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT)
