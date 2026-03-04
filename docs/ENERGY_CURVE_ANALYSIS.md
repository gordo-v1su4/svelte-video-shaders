# Energy Curve Status (Current Implementation)

## Summary

Speed ramping is fully implemented in `src/lib/VideoWorkbench.svelte` using Essentia energy-curve data plus pre-processing. The older "basic-only" analysis is no longer accurate.

Current pipeline:

1. Read `analysisData.energy.curve`.
2. Compute local mean/std from the curve.
3. Z-score normalize each sample and clamp to `[0..1]`.
4. Apply EMA smoothing (`speedRampSmoothing`).
5. Apply gamma/punch shaping (`speedRampPunch`).
6. Map to `[speedRampMinSpeed..speedRampMaxSpeed]`.
7. Integrate speed over time to build cumulative `processedTimeRemap`.

At runtime, the update loop samples the preprocessed arrays and either:

- drives `setAudioTime(remappedTime)` in audio-master mode, or
- drives `setSpeed(speed)` in non-audio-master mode.

## Implemented Controls

These controls are active in `Triggers & Effects > Speed Ramping`:

- `Enable Speed Ramping` (default `false`)
- `Min Speed` (`0.25` to `1.5`, default `0.8`)
- `Max Speed` (`0.5` to `3.0`, default `1.8`)
- `Smoothing` (`0.0` to `0.5`, default `0.15`)
- `Punch` (`0.5` to `3.0`, default `1.4`)

## Time-Remap Strategy

The implementation uses cumulative integration:

- `timeRemap[0] = 0`
- `timeRemap[i] = timeRemap[i - 1] + avg(speed[i - 1], speed[i]) * dt`

This replaces older approximate accumulation and keeps audio-video sync stable under changing ramp curves.

## Continuity During Toggle

When speed ramping is toggled on while playing:

1. The current remapped sample is read from `processedTimeRemap`.
2. `speedRampTimeOffset = audioCurrentTime - rawRemappedTime` is computed.
3. The renderer switches to direct frame mapping mode.

When toggled off, offset is reset and elapsed-time mapping is restored.

## Data Requirements

Speed ramping requires:

- `analysisData.energy.curve` with at least one sample
- valid duration context (`audioDuration`, with fallback to hop-size estimate)

If no curve exists, preprocessing is skipped and playback falls back to normal timing.

## Remaining Optional Enhancements

These are not required for current operation, but can be added later:

1. Interpolated curve sampling (instead of nearest/floor sample lookup).
2. Optional beat-snapped ramp mode.
3. Optional downsampled keyframe export path.

