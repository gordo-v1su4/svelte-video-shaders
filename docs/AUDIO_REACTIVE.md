# Audio-Reactive Playback System

This document describes the audio-reactive trigger system, timing architecture, and speed ramping used in the Svelte Video Shaders project.

## Architecture

```
Audio File (.wav/.mp3)
    |
    +---> Essentia API (Python) - Offline analysis
    |       +-- Beat Detection & BPM
    |       +-- Onset Detection (transients)
    |       +-- Energy Curve (for speed ramping)
    |       +-- Structural Segmentation (sections with energy)
    |
    +---> MIDI File (optional)
    |       +-- Note-on timestamps as custom markers
    |
    +---> Web Audio API (browser) - Real-time
            +-- Playback control & FFT analysis
            +-- audioLevel, bassLevel, midLevel, trebleLevel
```

## Update Loop Architecture

All time-critical operations run inside a single `requestAnimationFrame` loop (`updateTime()` in `VideoWorkbench.svelte`) to ensure atomicity:

```
updateTime() fires:
  1. Read audio time:    audioCurrentTime = audio.currentTime
  2. Update FFT:         audioAnalyzer.getAudioData() -> shader uniforms
  3. Check beat triggers: checkBeatTriggers(audioCurrentTime)
     -> If beat detected: seekToClip(newClip) BEFORE frame calc
  4. Compute frame:      setAudioTime(remappedTime) for CORRECT clip
  5. Schedule next:      requestAnimationFrame(updateTime)

render() fires (separate rAF loop in ShaderPlayer):
  -> Reads globalFrameIndex (always correct, no stale frames)
  -> Updates Three.js texture and renders
```

This design eliminates a previous race condition where beat detection ran in a Svelte `$effect` microtask that could fire *after* the frame was already rendered for the old clip. See `docs/CLIP_SWITCH_RACE_CONDITION_FIX.md` for the full diagnosis.

## Audio Master Clock

Audio time is the authoritative source for video frame position. `setAudioTime()` in `ShaderPlayer.svelte` has two modes:

```javascript
// Direct mapping (speed ramp active):
// remappedTime is a "virtual playback clock" encoding speed changes
targetFrame = Math.floor(remappedTime * fps);

// Elapsed-time mapping (no speed ramp):
// Simple clock-relative calculation
targetFrame = Math.floor((audioTime - clipStartTime) * fps);
```

The mode is controlled by `useDirectFrameMapping`, set automatically when speed ramping toggles on/off.

## Marker Sources

Two types of markers can trigger effects:

**Essentia Onsets (Orange markers)**
- Automatically detected transients from audio analysis
- Adjustable density via "Transient Density" slider
- Filtered by minimum interval based on BPM

**MIDI Markers (Blue markers)**
- Imported from MIDI files
- Note-on events converted to timestamps
- Useful for precise manual placement

Both are combined into `filteredOnsets` (a `$derived` value) based on which toggles are active.

## Trigger System

The `checkBeatTriggers(time)` function runs inside `updateTime()` on every frame. When audio playback crosses a marker:

```javascript
// Visual feedback
isBeatActive = true;
markerCounter++;

// === Video Swap (always active) ===
if (markerCounter >= markerSwapThreshold) {
    nextVideo();  // Switch to next video in section pool
    markerCounter = 0;
}

// === Jump Cut ===
if (enableJumpCuts) {
    shaderPlayerRef.jumpFrames(randomOffset);
}

// === FX Spike ===
if (enableFXTriggers) {
    fxTriggerActive = 1.0;  // Spikes shader params (noise, RGB shift)
}

// === Glitch Mode (high-energy sections only) ===
if (enableGlitchMode && sectionEnergy > glitchEnergyThreshold) {
    shaderPlayerRef.jumpFrames(microJump);
}
```

### Trigger Types

| Trigger | Always On? | Controls | Behavior |
|---------|-----------|----------|----------|
| **Video Cycling** | Yes | `markerSwapThreshold` (1-16) | Swap to next video after N markers. Always active -- no toggle. |
| **Jump Cuts** | No | `enableJumpCuts`, `jumpCutRange` (5-120 frames) | Random frame jump within +/-range on each marker |
| **FX Triggers** | No | `enableFXTriggers`, `fxTriggerIntensity` (0.1-1.0), `fxTriggerDecay` (0.01-0.5s) | Spikes shader params on beat, decays over time |
| **Glitch Mode** | No | `enableGlitchMode`, `glitchFrameRange` (1-15), `glitchEnergyThreshold` (0.1-1.0) | Micro-jumps only in high-energy sections |

### Beat Indicator
- `isBeatActive` lights up for 100ms on every marker hit
- Works independently of trigger effects (the light blinks even if all optional triggers are disabled)

## Speed Ramping

Energy-based video speed control using pre-processed curves from Essentia API data:

```javascript
// Pre-processed at analysis time:
processedSpeedCurve   // speed multiplier per timestep
processedTimeRemap    // cumulative "virtual time" per timestep

// At runtime (in updateTime):
const curveIndex = Math.floor(audioCurrentTime / speedCurveTimestep);
const remappedTime = processedTimeRemap[curveIndex] + speedRampTimeOffset;
shaderPlayerRef.setAudioTime(remappedTime, TARGET_FPS);
```

When speed ramping toggles on/off, a `speedRampTimeOffset` is calculated for visual continuity, and `ShaderPlayer` switches between direct and elapsed-time frame mapping.

**Controls:**

| Control | Type | Range | Description |
|---------|------|-------|-------------|
| Enable Ramping | Checkbox | - | Energy-based speed control |
| Min Speed | Slider | 0.1-2.0 | Minimum playback speed |
| Max Speed | Slider | 0.5-5.0 | Maximum playback speed |
| Smoothing | Slider | 0-1.0 | Energy curve smoothing |

## Essentia API Response Format

The `/analyze/rhythm` endpoint returns:

```json
{
    "bpm": 120.5,
    "beats": [0.5, 1.0, 1.5],
    "confidence": 0.95,
    "onsets": [0.1, 0.35, 0.6],
    "energy": {
        "mean": 0.45,
        "max": 0.92,
        "curve": [0.3, 0.35, 0.4]
    }
}
```

The `/analyze/structure` endpoint returns:

```json
{
    "sections": [
        {"start": 0, "end": 15.2, "label": "intro", "energy": 0.3},
        {"start": 15.2, "end": 45.8, "label": "verse", "energy": 0.5},
        {"start": 45.8, "end": 76.1, "label": "chorus", "energy": 0.8}
    ],
    "boundaries": [15.2, 45.8, 76.1]
}
```

## Tweakpane Controls

### Triggers & Effects

| Control | Type | Range | Description |
|---------|------|-------|-------------|
| Swap Threshold | Slider | 1-16 | Markers before video swap |
| Jump Cuts | Checkbox | - | Enable random frame jumps |
| Jump Range | Slider | 5-120 | Max frames to jump |
| Glitch Mode | Checkbox | - | High-energy micro-jumps |
| Glitch Frames | Slider | 1-15 | Micro-jump frame range |
| Energy Threshold | Slider | 0.1-1.0 | Energy level for glitch |
| FX Triggers | Checkbox | - | Shader parameter spikes |
| FX Intensity | Slider | 0.1-1.0 | Spike magnitude |
| FX Decay | Slider | 0.01-0.5 | Decay time in seconds |

### Audio Controls

| Control | Type | Range | Description |
|---------|------|-------|-------------|
| Volume | Slider | 0-1 | Audio playback volume |
| Transient Density | Slider | 0-1 | Onset marker filtering |
| Show 1/32 Grid | Checkbox | - | Display beat grid |

## Section-Based Video Pools

Videos are assigned to song sections. When audio enters a new section, video cycling is restricted to that section's pool:

```javascript
sectionVideoPools = {
    0: [0, 1, 2],    // Intro: videos 0, 1, 2
    1: [3, 4],       // Verse: videos 3, 4
    2: [0, 1, 3, 4], // Chorus: all available
};
```

## Troubleshooting

### No beat detection
1. Audio file uploaded and analyzed? (Check for BPM value)
2. Markers visible in waveform? (Check show toggles)
3. Marker density applied? (Click "Apply Marker Changes")
4. Playing audio? (`isPlaying` must be true)

### Speed ramping doesn't respond
- Ensure Essentia API returns an energy curve (check API response)
- Check that "Enable Ramping" is toggled on
- Verify `processedTimeRemap` is populated (check console logs)

### Glitch mode doesn't respond to energy
- Section energy must be returned by Essentia API
- Energy threshold may be too high -- lower `glitchEnergyThreshold`

## Usage Workflow

1. **Upload Videos**: Add video clips to the pool
2. **Upload Audio**: Load audio file (.wav or .mp3)
3. **Wait for Analysis**: Essentia API extracts beats, onsets, energy, and structure
4. **Optional: Upload MIDI**: Add custom markers from a DAW
5. **Configure Triggers**: Enable desired trigger types in Tweakpane
6. **Play**: Press play in waveform header or Tweakpane
7. **Fine-tune**: Adjust thresholds and ranges during playback

## Why Svelte (Not React)

This project uses Svelte 5 / SvelteKit. Key reasons:

- **No virtual DOM on the hot path**: The render loop runs at 60fps via rAF. Svelte compiles reactive updates to direct DOM mutations -- no diffing algorithm near the texture upload path.
- **`$state` for real-time parameters**: All tweakpane sliders are just `$state` variables with `bind:value`. In React, each would need `useState` + setter functions, and every slider change would re-render the component tree without careful memoization.
- **Clean `onMount` cleanup**: WebCodecs decoder, Three.js renderer, and audio analyzer all need teardown. Svelte's `onMount(() => { setup(); return cleanup; })` is straightforward vs React's `useEffect` strict mode gotchas.
- **Imperative escape hatch**: The timing-critical `checkBeatTriggers()` function runs imperatively inside `updateTime()`. In React, you'd need `useRef` for all mutable playback state to avoid stale closure issues in rAF callbacks -- essentially bypassing React's state system on the hot path.

The issues solved in this project (rAF loop timing, frame mapping math) are architectural -- they'd exist in any framework. Svelte stays out of the way on performance-critical paths while providing ergonomic reactivity for the UI layer.

## Best Practices

1. **Match video FPS to target FPS** (default 24fps)
2. **Pre-decode videos** for seamless playback (ImageBitmap frame buffer)
3. **Use MIDI for precise control** over specific triggers
4. **Start with low sensitivity** and increase gradually
5. **Test with different songs** to find optimal settings
6. **Keep trigger logic imperative** -- don't put per-frame beat checking in Svelte `$effect`

## Related Docs

- [CLIP_SWITCH_RACE_CONDITION_FIX.md](CLIP_SWITCH_RACE_CONDITION_FIX.md) -- Race condition diagnosis and fix
- [ESSENTIA_API.md](ESSENTIA_API.md) -- Full Essentia API documentation
- [ENERGY_CURVE_ANALYSIS.md](ENERGY_CURVE_ANALYSIS.md) -- Energy curve processing details
