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
from deepgram import DeepgramClient

# Environment variables for configuration
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))
# CORS origins - default to "*" but can be overridden
# Note: When using "*", allow_credentials must be False (browser security restriction)
CORS_ORIGINS_STR = os.getenv("CORS_ORIGINS", "*")
CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS_STR.split(",")]
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# Initialize Deepgram client if API key is provided
deepgram_client = None
if DEEPGRAM_API_KEY:
    deepgram_client = DeepgramClient(api_key=DEEPGRAM_API_KEY)

app = FastAPI(title="Audio Analysis API", version="1.0.0")

# CORS configuration (supports multiple origins via comma-separated env var)
# Note: When allow_credentials=True, you cannot use "*" - must specify exact origins
# Check if "*" is in the list of origins
use_wildcard = "*" in CORS_ORIGINS
cors_origins = CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=not use_wildcard,  # Can't use credentials with "*" (browser security)
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
        
        # Mood/Emotion and Genre classification (removed - not implemented yet)
        mood_classification = {}
        genre_classification = {}
        
        # Beat detection using RhythmExtractor2013
        rhythm_extractor = es.RhythmExtractor2013(method="multifeature")
        bpm, beats, beats_confidence, _, beats_intervals = rhythm_extractor(audio)
        
        # Onset detection using Essentia's OnsetDetector (more accurate than custom approach)
        # First get sample rate from audio length and duration
        sample_rate = 44100  # Default, but we'll verify
        actual_sample_rate = len(audio) / duration if duration > 0 else sample_rate
        
        # Use OnsetDetector for accurate onset detection
        # OnsetDetector uses spectral flux and other features
        frame_size = 2048
        hop_size = 512
        frames = es.FrameGenerator(audio, frameSize=frame_size, hopSize=hop_size)
        window = es.Windowing(type='hann')
        spectrum = es.Spectrum()
        onset_detector = es.OnsetRate()  # This gives us onset_rate
        
        # Get onset rate first
        onset_result = onset_detector(audio)
        onset_rate = 0.0
        onset_times_from_rate = []
        
        # OnsetRate returns (rate, onset_times) - extract both
        if isinstance(onset_result, (tuple, list)) and len(onset_result) >= 2:
            # Extract rate (first element)
            rate_value = onset_result[0]
            if isinstance(rate_value, np.ndarray):
                onset_rate = float(rate_value.item() if rate_value.size == 1 else np.mean(rate_value))
            elif hasattr(rate_value, '__len__') and len(rate_value) > 0:
                onset_rate = float(rate_value[0] if len(rate_value) == 1 else np.mean(rate_value))
            else:
                onset_rate = float(rate_value)
            
            # Extract onset_times (second element) - these are the actual onset timestamps!
            if len(onset_result) > 1:
                times_value = onset_result[1]
                if isinstance(times_value, np.ndarray):
                    onset_times_from_rate = [float(t) for t in times_value.flatten()]
                elif hasattr(times_value, '__len__'):
                    onset_times_from_rate = [float(t) for t in times_value]
                else:
                    onset_times_from_rate = [float(times_value)] if times_value is not None else []
        elif isinstance(onset_result, (tuple, list)) and len(onset_result) == 1:
            # Only rate returned
            rate_value = onset_result[0]
            if isinstance(rate_value, np.ndarray):
                onset_rate = float(rate_value.item() if rate_value.size == 1 else np.mean(rate_value))
            else:
                onset_rate = float(rate_value)
        else:
            # Single value
            if isinstance(onset_result, np.ndarray):
                onset_rate = float(onset_result.item() if onset_result.size == 1 else np.mean(onset_result))
            else:
                onset_rate = float(onset_result) if onset_result is not None else 0.0
        
        # Use OnsetDetector for more detailed onset detection
        # This algorithm uses spectral flux and other features for better accuracy
        onset_times = []
        frame_index = 0
        
        # Calculate spectral flux for each frame (better than simple energy)
        prev_spectrum = None
        
        for frame in frames:
            windowed = window(frame)
            spec = spectrum(windowed)
            
            if prev_spectrum is not None:
                # Spectral flux: measure of change in spectral magnitude
                # Positive flux indicates onset (sudden increase in energy)
                flux = np.sum(np.maximum(0, np.abs(spec) - np.abs(prev_spectrum)))
                
                # Adaptive threshold based on local energy
                local_energy = np.mean(np.abs(spec))
                threshold = local_energy * 0.15  # Lower threshold for more onsets
                
                if flux > threshold:
                    time = (frame_index * hop_size) / actual_sample_rate
                    if 0 <= time < duration:
                        onset_times.append(time)
            
            prev_spectrum = spec
            frame_index += 1
        
        # Combine onset_times from OnsetRate (if available) with detected onsets
        # Remove duplicates and sort
        all_onset_times = list(set(onset_times_from_rate + onset_times))
        all_onset_times.sort()
        
        # Filter out onsets that are too close together (within 10ms)
        filtered_onsets = []
        for onset in all_onset_times:
            if not filtered_onsets or (onset - filtered_onsets[-1]) >= 0.01:
                filtered_onsets.append(onset)
        
        onset_times = filtered_onsets
        
        # Energy analysis (overall audio energy)
        energy_analyzer = es.Energy()
        energy = energy_analyzer(audio)
        energy_mean = float(np.mean(energy) if hasattr(energy, '__len__') else energy)
        energy_std = float(np.std(energy) if hasattr(energy, '__len__') and len(energy) > 1 else 0.0)
        
        # Spectral centroid (brightness/timbre) - calculate manually
        spectral_centroids = []
        frames_centroid = es.FrameGenerator(audio, frameSize=2048, hopSize=512)
        window_centroid = es.Windowing(type='hann')
        spectrum_centroid = es.Spectrum()
        
        for frame in frames_centroid:
            windowed = window_centroid(frame)
            spec = spectrum_centroid(windowed)
            # Calculate spectral centroid manually: weighted mean of frequencies
            # Centroid = sum(frequency * magnitude) / sum(magnitude)
            frequencies = np.arange(len(spec)) * (actual_sample_rate / (2.0 * len(spec)))
            magnitude = np.abs(spec)
            if np.sum(magnitude) > 0:
                centroid_val = np.sum(frequencies * magnitude) / np.sum(magnitude)
            else:
                centroid_val = 0.0
            spectral_centroids.append(centroid_val)
        
        mean_spectral_centroid = float(np.mean(spectral_centroids)) if spectral_centroids else 0.0
        
        # Structural segmentation - detect section boundaries
        # Using energy and spectral features to identify structural changes
        frame_time = 0.5  # Analyze every 0.5 seconds
        frame_samples = int(44100 * frame_time)
        num_frames = int(len(audio) / frame_samples)
        
        energy_per_frame = []
        centroid_per_frame = []
        frame_times = []
        
        for i in range(num_frames):
            start = i * frame_samples
            end = min(start + frame_samples, len(audio))
            frame_audio = audio[start:end]
            
            if len(frame_audio) > 0:
                # Energy for this frame
                frame_energy = np.sum(frame_audio ** 2) / len(frame_audio)
                energy_per_frame.append(frame_energy)
                
                # Spectral centroid for this frame (calculate manually)
                if len(frame_audio) >= 2048:
                    frame_frames = es.FrameGenerator(frame_audio, frameSize=2048, hopSize=512)
                    frame_window = es.Windowing(type='hann')
                    frame_spectrum = es.Spectrum()
                    
                    frame_centroids = []
                    for f in frame_frames:
                        w = frame_window(f)
                        s = frame_spectrum(w)
                        # Calculate spectral centroid manually
                        frequencies = np.arange(len(s)) * (44100.0 / (2.0 * len(s)))
                        magnitude = np.abs(s)
                        if np.sum(magnitude) > 0:
                            c = np.sum(frequencies * magnitude) / np.sum(magnitude)
                        else:
                            c = 0.0
                        frame_centroids.append(c)
                    
                    if frame_centroids:
                        centroid_per_frame.append(np.mean(frame_centroids))
                    else:
                        centroid_per_frame.append(0.0)
                else:
                    centroid_per_frame.append(0.0)
                
                frame_times.append(i * frame_time)
        
        # Detect structural boundaries (significant changes in energy/spectral features)
        boundaries = []
        if len(energy_per_frame) > 1:
            energy_threshold = np.std(energy_per_frame) * 1.5
            centroid_threshold = np.std(centroid_per_frame) * 1.5 if len(centroid_per_frame) > 1 else 0
            
            for i in range(1, len(energy_per_frame)):
                energy_change = abs(energy_per_frame[i] - energy_per_frame[i-1])
                centroid_change = abs(centroid_per_frame[i] - centroid_per_frame[i-1]) if i < len(centroid_per_frame) else 0
                
                # Significant change indicates a structural boundary
                if energy_change > energy_threshold or centroid_change > centroid_threshold:
                    boundary_time = frame_times[i]
                    if boundary_time > 0 and boundary_time < duration:
                        boundaries.append(boundary_time)
        
        # Basic structure labeling (heuristic-based)
        # This is a simplified approach - for accurate labeling, ML models are needed
        sections = []
        if boundaries:
            # Add start and end
            all_boundaries = [0.0] + sorted(set(boundaries)) + [duration]
            
            # Heuristic labeling based on position and energy
            for i in range(len(all_boundaries) - 1):
                start = all_boundaries[i]
                end = all_boundaries[i + 1]
                section_duration = end - start
                
                # Get average energy for this section
                start_frame = int(start / frame_time)
                end_frame = int(end / frame_time)
                if start_frame < len(energy_per_frame) and end_frame <= len(energy_per_frame):
                    section_energy = np.mean(energy_per_frame[start_frame:end_frame]) if end_frame > start_frame else 0
                else:
                    section_energy = energy_mean
                
                # Simple heuristic labeling
                label = "section"
                if i == 0:
                    label = "intro"
                elif i == len(all_boundaries) - 2:
                    label = "outro"
                elif section_energy > energy_mean * 1.2:
                    # Higher energy likely indicates chorus
                    label = "chorus"
                elif section_energy < energy_mean * 0.8:
                    # Lower energy likely indicates verse
                    label = "verse"
                else:
                    # Medium energy could be bridge or transition
                    if section_duration < duration * 0.1:
                        label = "bridge"
                    else:
                        label = "verse"
                
                sections.append({
                    "start": float(start),
                    "end": float(end),
                    "duration": float(section_duration),
                    "label": label,
                    "energy": float(section_energy)
                })
        else:
            # No boundaries detected, treat as single section
            sections.append({
                "start": 0.0,
                "end": duration,
                "duration": duration,
                "label": "song",
                "energy": energy_mean
            })
        
        # Deepgram transcription (if API key is configured)
        # Isolated in try-except so errors don't affect Essentia analysis
        transcription = None
        words = []
        paragraphs = []
        utterances = []  # Phrases/utterances with timestamps
        if deepgram_client:
            try:
                # Deepgram SDK v3 - simplified approach to avoid API signature issues
                # For now, skip Deepgram if it causes errors - Essentia analysis is more important
                print("Deepgram transcription temporarily disabled due to API changes")
                # TODO: Update Deepgram SDK usage when API is stable
                pass
            except Exception as e:
                print(f"Deepgram transcription error (non-fatal): {e}")
                # Continue without transcription - Essentia analysis is more important
                pass
        
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
            "spectral_centroid": mean_spectral_centroid,
            "structure": {
                "sections": sections,
                "boundaries": sorted(set(boundaries)) if boundaries else []
            },
            "mood": mood_classification if mood_classification else None,
            "genre": genre_classification if genre_classification else None,
            "transcription": {
                "text": transcription,
                "words": words,
                "paragraphs": paragraphs,
                "utterances": utterances  # Phrases with timestamps for UI markers
            } if transcription else None
        }
    except Exception as e:
        # Log the full error for debugging
        import traceback
        error_trace = traceback.format_exc()
        print(f"[ERROR] Analysis failed: {e}")
        print(error_trace)
        
        # Return error response
        return {
            "error": str(e),
            "bpm": 0,
            "beats": [],
            "confidence": 0,
            "duration": 0
        }
    finally:
        # Cleanup temp file
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception as e:
                print(f"Warning: Could not delete temp file {tmp_path}: {e}")

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=API_HOST, port=API_PORT)
