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
cors_origins = CORS_ORIGINS if "*" not in CORS_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if "*" not in CORS_ORIGINS else False,  # Can't use credentials with "*"
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
        
        # Mood/Emotion and Genre classification using TensorFlow models
        mood_classification = {}
        genre_classification = {}
        
        # Try to use TensorFlow models for classification
        # Models are downloaded to /app/models (effnetdiscogs, musicnn, classification_heads)
        # Note: Full TensorFlow model integration requires proper feature extraction pipelines
        # This is a placeholder that acknowledges models are present
        try:
            models_path = os.getenv("ESSENTIA_MODELS_PATH", "/app/models")
            
            if os.path.exists(models_path):
                effnet_path = os.path.join(models_path, "effnetdiscogs")
                musicnn_path = os.path.join(models_path, "musicnn")
                classification_path = os.path.join(models_path, "classification_heads")
                
                models_found = []
                if os.path.exists(effnet_path):
                    models_found.append("effnetdiscogs (genre classification)")
                if os.path.exists(musicnn_path):
                    models_found.append("musicnn (auto-tagging)")
                if os.path.exists(classification_path):
                    models_found.append("classification_heads (mood/emotion)")
                
                if models_found:
                    print(f"✅ TensorFlow models found: {', '.join(models_found)}")
                    print("⚠️  Note: TensorFlow model inference requires proper feature extraction pipeline")
                    print("   Models are available but full classification needs implementation")
                    print("   For now, returning empty classifications - models ready for integration")
                else:
                    print("⚠️  Models directory exists but no model subdirectories found")
                    
        except Exception as e:
            # Models not available or error during classification
            print(f"TensorFlow model check error: {e}")
            import traceback
            traceback.print_exc()
        
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
                
                # Spectral centroid for this frame
                if len(frame_audio) >= 2048:
                    frame_frames = es.FrameGenerator(frame_audio, frameSize=2048, hopSize=512)
                    frame_window = es.Windowing(type='hann')
                    frame_spectrum = es.Spectrum()
                    frame_centroid_alg = es.SpectralCentroid()
                    
                    frame_centroids = []
                    for f in frame_frames:
                        w = frame_window(f)
                        s = frame_spectrum(w)
                        c = frame_centroid_alg(s)
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
        transcription = None
        words = []
        paragraphs = []
        utterances = []  # Phrases/utterances with timestamps
        if deepgram_client:
            try:
                # Use transcribe_file for local file (new SDK syntax)
                with open(tmp_path, 'rb') as audio_file:
                    response = deepgram_client.listen.v1.media.transcribe_file(
                        audio_file,
                        model="nova-3",
                        language="en",
                        summarize="v2",
                        topics=True,
                        intents=True,
                        sentiment=True,
                        smart_format=True,
                        punctuate=True,
                        paragraphs=True,
                        utterances=True,
                        utt_split=0.7,
                    )
                    
                    if response and hasattr(response, 'results'):
                        channels = response.results.channels
                        if channels and len(channels) > 0:
                            alternatives = channels[0].alternatives
                            if alternatives and len(alternatives) > 0:
                                alt = alternatives[0]
                                transcription = alt.transcript if hasattr(alt, 'transcript') else ''
                                
                                # Extract words with timestamps
                                if hasattr(alt, 'words') and alt.words:
                                    for word_info in alt.words:
                                        words.append({
                                            "word": word_info.word if hasattr(word_info, 'word') else str(word_info),
                                            "start": word_info.start if hasattr(word_info, 'start') else 0.0,
                                            "end": word_info.end if hasattr(word_info, 'end') else 0.0,
                                            "confidence": word_info.confidence if hasattr(word_info, 'confidence') else 0.0
                                        })
                                
                                # Extract paragraphs if available
                                if hasattr(alt, 'paragraphs') and alt.paragraphs:
                                    for para_info in alt.paragraphs:
                                        para_text = ''
                                        if hasattr(para_info, 'sentences') and para_info.sentences:
                                            para_text = ' '.join([s.text for s in para_info.sentences if hasattr(s, 'text')])
                                        
                                        paragraphs.append({
                                            "text": para_text,
                                            "start": para_info.start if hasattr(para_info, 'start') else 0.0,
                                            "end": para_info.end if hasattr(para_info, 'end') else 0.0
                                        })
                                
                                # Extract utterances/phrases (this is what we want for phrase markers)
                                # Utterances are typically at the channel level
                                if hasattr(channels[0], 'utterances') and channels[0].utterances:
                                    for utt_info in channels[0].utterances:
                                        utterances.append({
                                            "text": utt_info.transcript if hasattr(utt_info, 'transcript') else '',
                                            "start": utt_info.start if hasattr(utt_info, 'start') else 0.0,
                                            "end": utt_info.end if hasattr(utt_info, 'end') else 0.0,
                                            "confidence": utt_info.confidence if hasattr(utt_info, 'confidence') else 0.0
                                        })
                                # Also check if utterances are in the response directly
                                elif hasattr(response.results, 'utterances') and response.results.utterances:
                                    for utt_info in response.results.utterances:
                                        utterances.append({
                                            "text": utt_info.transcript if hasattr(utt_info, 'transcript') else '',
                                            "start": utt_info.start if hasattr(utt_info, 'start') else 0.0,
                                            "end": utt_info.end if hasattr(utt_info, 'end') else 0.0,
                                            "confidence": utt_info.confidence if hasattr(utt_info, 'confidence') else 0.0
                                        })
            except Exception as e:
                print(f"Deepgram transcription error: {e}")
                import traceback
                traceback.print_exc()
                # Continue without transcription if Deepgram fails
        
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
