# Energy Curve Implementation Analysis

## Summary

The `ENERGY_CURVE_IMPLE.md` document provides a comprehensive guide for implementing sophisticated energy-based speed ramping. **The project already has basic energy curve support**, but the document outlines advanced techniques that could enhance the current implementation.

## Current Implementation Status

### ✅ What's Already Working

1. **Energy Curve Access**: The code already accesses `analysisData.energy.curve` from the Essentia API
2. **Basic Speed Ramping**: Simple formula: `speed = baseSpeed + (energy * speedRampSensitivity)`
3. **Frame Index Calculation**: Uses `SECONDS_PER_FRAME = 512/44100` to map audio time to energy curve indices
4. **Two Modes**:
   - **Audio Master Clock Mode**: Applies speed ramping via time remapping (`audioRampedTime`)
   - **Direct Speed Mode**: Sets playback speed directly via `shaderPlayerRef.setSpeed()`

### Current Code Location
- **File**: `src/lib/VideoWorkbench.svelte`
- **Lines**: 530-594
- **Key Variables**:
  - `enableSpeedRamping` (toggle)
  - `speedRampSensitivity` (2.0 default)
  - `baseSpeed` (1.0 default)
  - `audioRampedTime` (for time remapping)

## Document Recommendations vs Current Implementation

### 1. Timestamp Calculation

**Document Suggests:**
```javascript
const N = energy.curve.length;
const dt = duration / Math.max(1, (N - 1));
const tSec = Array.from({ length: N }, (_, i) => i * dt);
```

**Current Implementation:**
```javascript
const SECONDS_PER_FRAME = ESSENTIA_HOP_SIZE / ESSENTIA_SAMPLE_RATE; // 512/44100
const frameIndex = Math.floor(audioCurrentTime / SECONDS_PER_FRAME);
```

**Analysis**: Current approach assumes fixed hop size (512 samples @ 44.1kHz). Document's approach derives timestep from `duration` and `curve.length`, which is more accurate if API doesn't guarantee hop size.

**Recommendation**: ✅ Current approach is fine if API consistently uses 512-hop. Consider document's approach if hop size varies.

---

### 2. Energy Normalization

**Document Suggests:**
```javascript
// Z-score normalization using mean/std
const z = energy.curve.map(v => (v - energy.mean) / (energy.std || 1e-9));
const e01 = z.map(v => clamp01((v + 2) / 4)); // map z≈[-2..+2] → [0..1]
```

**Current Implementation:**
```javascript
// Assumes energy.curve is already 0-1 normalized
const energy = analysisData.energy.curve[frameIndex] ?? 0;
const newSpeed = baseSpeed + (energy * speedRampSensitivity);
```

**Analysis**: Current code assumes API returns normalized values. Document's approach normalizes using statistical properties (mean/std), which is more robust across different audio masters.

**Recommendation**: ⚠️ **Should implement normalization** if energy values aren't guaranteed to be 0-1. Check API response to verify.

---

### 3. Smoothing (EMA)

**Document Suggests:**
```javascript
function ema(arr, alpha=0.15){
  let y = arr[0] ?? 0;
  return arr.map(x => (y = alpha*x + (1-alpha)*y));
}
const eSmooth = ema(e01, 0.12);
```

**Current Implementation:**
```javascript
// No smoothing - uses raw energy values directly
const energy = analysisData.energy.curve[frameIndex] ?? 0;
```

**Analysis**: Current implementation uses raw energy values, which can cause jittery speed changes. Document's EMA smoothing creates more intentional, musical ramps.

**Recommendation**: ⚠️ **Should add smoothing** to prevent jittery playback. EMA with alpha=0.12-0.15 is a good starting point.

---

### 4. Speed Mapping with Gamma Correction

**Document Suggests:**
```javascript
const minSpeed = 0.7;   // slow-mo
const maxSpeed = 1.6;   // fast
const gamma = 1.6;      // >1 makes highs punchier

const speed = eSmooth.map(e => {
  const shaped = Math.pow(e, gamma);
  return minSpeed + (maxSpeed - minSpeed) * shaped;
});
```

**Current Implementation:**
```javascript
// Linear mapping
const newSpeed = baseSpeed + (energy * speedRampSensitivity);
```

**Analysis**: Current approach is linear. Document's gamma correction (`Math.pow(e, gamma)`) makes high-energy sections more punchy, which is more musically satisfying.

**Recommendation**: ⚠️ **Consider adding gamma correction** for more dynamic speed ramps. Could expose `gamma` as a tweakpane parameter.

---

### 5. Keyframe Downsampling

**Document Suggests:**
```javascript
// Downsample to ~150ms intervals
const step = Math.max(1, Math.round(0.15 / dt));
const keyframes = [];
for (let i = 0; i < N; i += step) {
  keyframes.push({ t: tSec[i], speed: speed[i] });
}
```

**Current Implementation:**
```javascript
// Updates speed every frame (60fps via requestAnimationFrame)
// No downsampling - speed changes every ~16ms
```

**Analysis**: Current approach updates speed every frame, which is fine for real-time but could be optimized. Document's approach creates keyframes at musical intervals (150ms) and interpolates.

**Recommendation**: ✅ Current approach is fine for real-time. Keyframe approach is better for pre-computed ramps or export.

---

### 6. Time Remapping (Cumulative Integral)

**Document Suggests:**
```javascript
// Cumulative integral: u[i] = sourceTime at projectTime t[i]
const u = new Array(N).fill(0);
for (let i = 1; i < N; i++) {
  const sAvg = (speed[i-1] + speed[i]) * 0.5;
  u[i] = u[i-1] + sAvg * dt;
}
// Sample visuals at u(t) while audio plays at t
```

**Current Implementation (Audio Master Mode):**
```javascript
// Approximate time remapping
audioRampedTime += deltaTime * newSpeed;
shaderPlayerRef.setAudioTime(audioRampedTime, TARGET_FPS);
```

**Analysis**: Current implementation does approximate time remapping by accumulating `deltaTime * speed`. Document's approach is mathematically correct (cumulative integral) and handles variable speeds more accurately.

**Recommendation**: ⚠️ **Should implement proper cumulative integral** for accurate time remapping, especially for complex speed curves.

---

### 7. Beat-Snapped Keyframes

**Document Suggests:**
```javascript
// Only allow ramp keyframes at beats/onsets
// Set speed targets from nearby energy values
// Interpolate between targets
```

**Current Implementation:**
```javascript
// No beat snapping - speed changes continuously
```

**Analysis**: Document's approach makes ramps feel more "musical" by aligning speed changes to rhythm. Current implementation is continuous.

**Recommendation**: ⚠️ **Consider adding beat-snapped mode** as an optional feature. Could toggle between continuous and beat-snapped ramps.

---

## Implementation Priority

### High Priority (Improves Quality)
1. **Energy Normalization** - Ensure consistent behavior across different audio files
2. **Smoothing (EMA)** - Prevent jittery speed changes
3. **Proper Time Remapping** - Fix cumulative integral for accurate audio-video sync

### Medium Priority (Enhances Experience)
4. **Gamma Correction** - More dynamic, punchy speed ramps
5. **Beat-Snapped Keyframes** - Optional mode for musical alignment

### Low Priority (Optimization)
6. **Keyframe Downsampling** - Only needed for pre-computed ramps or export
7. **Timestamp Derivation** - Only needed if API hop size varies

## Recommended Next Steps

1. **Verify API Response**: Check if `energy.curve` values are already normalized (0-1) or need normalization
2. **Add Smoothing**: Implement EMA filter to prevent jittery speed changes
3. **Fix Time Remapping**: Implement proper cumulative integral for audio master clock mode
4. **Add Gamma Correction**: Expose as tweakpane parameter for user control
5. **Optional Beat Snapping**: Add toggle for beat-aligned speed changes

## Code Example: Enhanced Speed Ramping

```javascript
// Pre-process energy curve (once on analysis load)
function preprocessEnergyCurve(energyData, duration) {
  const N = energyData.curve.length;
  const dt = duration / Math.max(1, (N - 1));
  
  // Normalize using mean/std
  const z = energyData.curve.map(v => 
    (v - energyData.mean) / (energyData.std || 1e-9)
  );
  const e01 = z.map(v => Math.max(0, Math.min(1, (v + 2) / 4)));
  
  // Smooth with EMA
  const eSmooth = ema(e01, 0.12);
  
  // Map to speed with gamma
  const minSpeed = 0.7;
  const maxSpeed = 1.6;
  const gamma = 1.6;
  const speeds = eSmooth.map(e => {
    const shaped = Math.pow(e, gamma);
    return minSpeed + (maxSpeed - minSpeed) * shaped;
  });
  
  // Pre-compute time remap curve
  const timeRemap = new Array(N).fill(0);
  for (let i = 1; i < N; i++) {
    const sAvg = (speeds[i-1] + speeds[i]) * 0.5;
    timeRemap[i] = timeRemap[i-1] + sAvg * dt;
  }
  
  return { speeds, timeRemap, dt, tSec: Array.from({ length: N }, (_, i) => i * dt) };
}

// Use in updateTime()
if (enableSpeedRamping && preprocessedEnergy) {
  const t = audioCurrentTime;
  const i = Math.floor(t / preprocessedEnergy.dt);
  const clampedI = Math.max(0, Math.min(preprocessedEnergy.speeds.length - 1, i));
  
  if (audioMasterEnabled) {
    // Use pre-computed time remap
    const sourceTime = preprocessedEnergy.timeRemap[clampedI];
    shaderPlayerRef.setAudioTime(sourceTime, TARGET_FPS);
  } else {
    // Direct speed control
    const speed = preprocessedEnergy.speeds[clampedI];
    shaderPlayerRef.setSpeed(speed);
  }
}
```

## Conclusion

The current implementation provides **basic energy-based speed ramping** that works, but the document outlines **advanced techniques** that would significantly improve:
- **Smoothness** (EMA smoothing)
- **Accuracy** (proper time remapping)
- **Musicality** (beat snapping, gamma correction)
- **Robustness** (statistical normalization)

**Recommendation**: Implement the high-priority improvements (normalization, smoothing, time remapping) to enhance the current working implementation.
