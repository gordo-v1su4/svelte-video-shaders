# Audio-Reactive Playback System

This document describes the audio-reactive trigger system used in the Svelte Video Shaders project.

## Overview

The audio-reactive system synchronizes video playback, shader effects, and visual triggers with audio analysis data. The system uses audio as the master clock, ensuring video frames stay perfectly synchronized with the music.

## Architecture

```
Audio File (.wav/.mp3)
    │
    ├──► Essentia API (Python)
    │       ├── Beat Detection
    │       ├── BPM Extraction  
    │       ├── Onset Detection (transients)
    │       ├── Energy Curve (for speed ramping)
    │       └── Structural Segmentation
    │
    ├──► MIDI File (optional)
    │       └── Note-on timestamps
    │
    └──► Web Audio API (browser)
            └── Real-time playback control
```

## Core Components

### 1. Audio Master Clock

Audio time is the authoritative source for video frame position:

```javascript
// In VideoWorkbench.svelte
if (audioMasterEnabled && shaderPlayerRef) {
    shaderPlayerRef.setAudioTime(audioCurrentTime, TARGET_FPS);
}
```

The `setAudioTime()` function in `ShaderPlayer.svelte` converts audio time to frame index:

```javascript
export function setAudioTime(audioTimeSeconds, fps = 24) {
    const targetFrame = Math.floor(audioTimeSeconds * fps);
    globalFrameIndex = targetFrame % frameBuffer.totalFrames;
}
```

### 2. Marker Sources

Two types of markers can trigger video effects:

#### Essentia Onsets (Orange markers)
- Automatically detected transients from audio analysis
- Adjustable density via "Transient Density" slider
- Filtered by minimum interval based on BPM

#### MIDI Markers (Blue markers)  
- Imported from MIDI files
- Note-on events converted to timestamps
- Useful for precise manual placement

### 3. Trigger System

When audio playback crosses a marker, multiple triggers can fire:

```javascript
if (hit) {
    // Visual feedback
    isBeatActive = true;
    markerCounter++;
    
    // === TRIGGER: Video Swap ===
    if (enableVideoCycling && markerCounter >= markerSwapThreshold) {
        nextVideo();
        markerCounter = 0;
    }
    
    // === TRIGGER: Jump Cut ===
    if (enableJumpCuts && shaderPlayerRef) {
        const jumpAmount = Math.floor(Math.random() * jumpCutRange * 2) - jumpCutRange;
        shaderPlayerRef.jumpFrames(jumpAmount);
    }
    
    // === TRIGGER: FX Spike ===
    if (enableFXTriggers) {
        fxTriggerActive = 1.0;
    }
}
```

### 4. Trigger Types

#### Video Cycling
- **Control**: `enableVideoCycling` toggle
- **Setting**: `markerSwapThreshold` (1-16)
- **Behavior**: After N markers, switch to next video in pool

#### Jump Cuts
- **Control**: `enableJumpCuts` toggle
- **Setting**: `jumpCutRange` (5-120 frames)
- **Behavior**: Random frame jump within ±range on each marker

#### Glitch Mode
- **Control**: `enableGlitchMode` toggle
- **Settings**: 
  - `glitchFrameRange` (1-15 frames)
  - `glitchEnergyThreshold` (0.1-1.0)
- **Behavior**: Micro-jumps only in high-energy sections

#### FX Triggers
- **Control**: `enableFXTriggers` toggle
- **Settings**:
  - `fxTriggerIntensity` (0.1-1.0)
  - `fxTriggerDecay` (0.01-0.5 seconds)
- **Behavior**: Spikes shader params (noise, RGB shift) on beat

### 5. Speed Ramping

Energy-based video speed control:

```javascript
if (enableSpeedRamping && analysisData.energy?.curve) {
    const energy = analysisData.energy.curve[frameIndex];
    const newSpeed = baseSpeed + (energy * speedRampSensitivity);
    shaderPlayerRef.setSpeed(newSpeed);
}
```

## Essentia API Response Format

The `/analyze` endpoint returns:

```json
{
    "bpm": 120.5,
    "beats": [0.5, 1.0, 1.5, ...],
    "confidence": 0.95,
    "onsets": [0.1, 0.35, 0.6, ...],
    "energy": {
        "mean": 0.45,
        "max": 0.92,
        "curve": [0.3, 0.35, 0.4, ...]
    },
    "structure": {
        "sections": [
            {"start": 0, "end": 15.2, "label": "intro", "energy": 0.3},
            {"start": 15.2, "end": 45.8, "label": "verse", "energy": 0.5},
            {"start": 45.8, "end": 76.1, "label": "chorus", "energy": 0.8}
        ],
        "boundaries": [15.2, 45.8, 76.1]
    }
}
```

## Tweakpane Controls

### Triggers & Effects Folder

| Control | Type | Range | Description |
|---------|------|-------|-------------|
| Video Cycling | Checkbox | - | Enable/disable video swapping |
| Swap Threshold | Slider | 1-16 | Markers before video swap |
| Jump Cuts | Checkbox | - | Enable random frame jumps |
| Jump Range | Slider | 5-120 | Max frames to jump |
| Glitch Mode | Checkbox | - | High-energy micro-jumps |
| Glitch Frames | Slider | 1-15 | Micro-jump frame range |
| Energy Threshold | Slider | 0.1-1.0 | Energy level for glitch |
| FX Triggers | Checkbox | - | Shader parameter spikes |
| FX Intensity | Slider | 0.1-1.0 | Spike magnitude |
| FX Decay | Slider | 0.01-0.5 | Decay time in seconds |

### Audio Controls Folder

| Control | Type | Range | Description |
|---------|------|-------|-------------|
| Volume | Slider | 0-1 | Audio playback volume |
| Transient Density | Slider | 0-1 | Onset marker filtering |
| Show 1/32 Grid | Checkbox | - | Display beat grid |

### Speed Ramping Folder

| Control | Type | Range | Description |
|---------|------|-------|-------------|
| Enable Ramping | Checkbox | - | Energy-based speed control |
| Base Speed | Slider | 0.1-2.0 | Minimum playback speed |
| Sensitivity | Slider | 0-5.0 | Energy-to-speed multiplier |

## Usage Workflow

1. **Upload Audio**: Load your audio file (.wav or .mp3)
2. **Wait for Analysis**: Essentia API extracts beats, onsets, and structure
3. **Upload Videos**: Add video clips to the pool
4. **Optional: Upload MIDI**: Add custom markers from a DAW
5. **Configure Triggers**: Enable desired trigger types in Tweakpane
6. **Play**: Press play in waveform header or Tweakpane
7. **Fine-tune**: Adjust thresholds and ranges during playback

## Section-Based Video Pools (Planned)

Future feature: Assign specific videos to song sections:

```javascript
sectionVideoPools = {
    0: [0, 1, 2],    // Intro: videos 0, 1, 2
    1: [3, 4],       // Verse: videos 3, 4
    2: [0, 1, 3, 4], // Chorus: all available
};
```

When audio enters a new section, video cycling is restricted to that section's pool.

## Best Practices

1. **Match video FPS to target FPS** (default 24fps)
2. **Pre-decode videos** for seamless playback
3. **Use MIDI for precise control** over specific triggers
4. **Start with low sensitivity** and increase gradually
5. **Test with different songs** to find optimal settings

