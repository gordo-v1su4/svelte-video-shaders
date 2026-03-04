# Trigger System Status (Current Implementation)

## Overview

The app runs trigger detection inside the `updateTime()` rAF loop in `VideoWorkbench.svelte`. Marker crossings are handled before `setAudioTime()` so clip switching and frame calculation stay in sync.

## Trigger Types

### 1. Video Cycling

- State: Always active (no enable toggle)
- Control: `markerSwapThreshold` (default `4`, range `1..16`)
- Behavior: Swaps clip when marker counter reaches threshold
- Notes: If only one clip is available in the current section pool, swaps may appear as no-op

### 2. Jump Cuts

- State: Disabled by default
- Controls: `enableJumpCuts` (default `false`), `jumpCutRange` (default `30`, range `5..120`)
- Behavior: Applies random frame jump on marker hit

### 3. Glitch Mode

- State: Disabled by default
- Controls: `enableGlitchMode` (default `false`), `glitchFrameRange` (default `5`, range `1..15`), `glitchEnergyThreshold` (default `0.7`, range `0.1..1.0`)
- Behavior: Applies micro-jumps only when the current section energy exceeds threshold
- Requirement: Structure analysis with section energy data

### 4. FX Triggers

- State: Disabled by default
- Controls: `enableFXTriggers` (default `false`), `fxTriggerIntensity` (default `0.5`, range `0.1..1.0`), `fxTriggerDecay` (default `0.1`, range `0.01..0.5`)
- Behavior: Spikes selected shader uniforms and decays over time

### 5. Speed Ramping

- State: Disabled by default
- Control group: `Triggers & Effects > Speed Ramping`
- Uses preprocessed energy curve (`processedSpeedCurve`, `processedTimeRemap`)
- Behavior: audio-master mode sets `setAudioTime(remappedTime)`, non-audio-master mode sets `setSpeed(currentSpeed)`

## Marker Sources

Markers come from:

- Essentia onsets
- MIDI note-on timestamps

Sources are filtered by density settings and toggle state, then merged into `filteredOnsets` for trigger evaluation.

## Beat Indicator and Counter

- `isBeatActive`: visual blink for each marker hit
- `markerCounter`: increments per marker, reset after video swap

The indicator can blink even when optional triggers are disabled.

## Troubleshooting

### Beat indicator blinks but clips do not visibly change

1. Check `Swap Every N Markers` (it may be set high).
2. Confirm multiple clips are loaded in the active section pool.
3. Confirm playback is active and markers are present.

### No trigger events at all

1. Verify audio analysis completed (BPM/onsets available).
2. Verify marker visibility/toggles and density settings.
3. Verify transport is playing.

### Speed ramping appears inactive

1. Enable `Speed Ramping`.
2. Confirm `analysisData.energy.curve` exists.
3. Confirm preprocessing status shows ready.

### Glitch mode does not fire

1. Enable `Glitch Mode`.
2. Lower `Energy Threshold`.
3. Confirm structure sections include energy values.

## Default State Summary

| Feature | Default |
|---|---|
| Video Cycling | Active |
| Jump Cuts | Off |
| Glitch Mode | Off |
| FX Triggers | Off |
| Speed Ramping | Off |
