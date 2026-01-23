# Trigger System Status & Troubleshooting

## Current Trigger System Overview

The app has a unified trigger system that responds to audio markers (onsets/beats/MIDI). Here's the current state:

### Trigger Types

#### 1. **Video Cycling** (Lines 767-770)
- **Status**: ⚠️ DISABLED BY DEFAULT
- **Location**: Triggers & Effects > Video Cycling
- **Controls**:
  - `enableVideoCycling` - Must be **enabled** for video swapping
  - `markerSwapThreshold` - Swap video after N markers (default: 4)
- **How it works**: On every Nth marker hit, calls `nextVideo()` which swaps to next video in section pool
- **Issue**: If disabled, beat triggers will light up but video won't change

#### 2. **Jump Cuts** (Lines 773-776)
- **Status**: ⚠️ DISABLED BY DEFAULT  
- **Location**: Triggers & Effects > Jump Cuts
- **Controls**:
  - `enableJumpCuts` - Must be **enabled**
  - `jumpCutRange` - Max frames to jump (default: 30)
- **How it works**: Random frame jump on every marker hit
- **Requires**: `shaderPlayerRef` must be initialized

#### 3. **Glitch Mode** (Lines 785-795)
- **Status**: ⚠️ DISABLED BY DEFAULT + ✅ READY (After API Update)
- **Location**: Triggers & Effects > Glitch Mode  
- **Controls**:
  - `enableGlitchMode` - Must be **enabled**
  - `glitchFrameRange` - Micro-jump range (default: 5 frames)
  - `glitchEnergyThreshold` - Energy level to trigger (default: 0.7)
- **How it works**: Rapid micro-jumps in high-energy sections
- **Update**: Section energy added to API! Deploy updated API to enable

#### 4. **FX Triggers** (Lines 779-781, 815-828)
- **Status**: ⚠️ DISABLED BY DEFAULT
- **Location**: Triggers & Effects > FX Triggers
- **Controls**:
  - `enableFXTriggers` - Must be **enabled**
  - `fxTriggerIntensity` - Spike amount (default: 0.5)
  - `fxTriggerDecay` - Decay speed (default: 0.1s)
- **How it works**: Spikes shader parameters (noise, RGB shift) on marker hit

#### 5. **Speed Ramping** (Lines 526-538)
- **Status**: ⚠️ DISABLED BY DEFAULT + ✅ READY (After API Update)
- **Location**: Triggers & Effects > Speed Ramping
- **Controls**:
  - `enableSpeedRamping` - Must be **enabled**
  - `baseSpeed` - Base playback speed (default: 1.0)
  - `speedRampSensitivity` - How much energy affects speed (default: 2.0)
- **How it works**: Adjusts video playback speed based on audio energy
- **Update**: Energy curve added to API! Deploy updated API to enable

## Marker Detection System

### Beat Indicator (Line 762)
- `isBeatActive` - Lights up for 100ms on every marker hit
- This works independently of trigger effects
- **The light WILL blink even if all triggers are disabled**

### Marker Counter (Line 763)
- `markerCounter` - Increments on every marker hit
- Used by Video Cycling to determine when to swap

### Filtered Onsets (Lines 172-178)
- Combines MIDI markers and Essentia onsets based on toggle state
- Only includes markers if respective toggle is ON
- These are the markers that trigger ALL effects

## Troubleshooting

### Problem: Beat light blinks but video doesn't change

**Root Cause**: `enableVideoCycling` is disabled by default

**Solution**:
1. Open "Triggers & Effects" folder
2. Expand "Video Cycling" 
3. Enable "Enable Video Cycling" checkbox
4. Adjust "Swap Every N Markers" slider (e.g., set to 1 for every beat, 4 for every 4 beats)

### Problem: No beat detection at all

**Checklist**:
1. Audio file uploaded and analyzed? (Check for BPM value)
2. Markers visible in waveform? (Check show toggles)
3. Marker density applied? (Click "Apply Marker Changes" button)
4. Playing audio? (`isPlaying` must be true)

### Problem: Speed ramping doesn't work

**Root Cause**: External Essentia API needs to be updated

**Solutions**:
- **Option 1**: Deploy updated API with energy curve support (see `ENERGY_CURVE_UPDATE.md` in essentia-endpoint repo)
- **Option 2**: Run local API with updated code (see `API_COMPATIBILITY.md`)
- **Status**: Energy curve code added, ready to deploy

### Problem: Glitch mode doesn't respond to energy

**Root Cause**: External API needs to be updated

**Solutions**:
- **Option 1**: Deploy updated API with section energy support (see `ENERGY_CURVE_UPDATE.md` in essentia-endpoint repo)
- **Status**: Section energy code added, ready to deploy

## Default States Summary

| Trigger Type | Default State | Works with External API |
|--------------|--------------|------------------------|
| Video Cycling | ❌ Disabled | ✅ Yes |
| Jump Cuts | ❌ Disabled | ✅ Yes |  
| Glitch Mode | ❌ Disabled | ✅ Yes (after API update) |
| FX Triggers | ❌ Disabled | ✅ Yes |
| Speed Ramping | ❌ Disabled | ✅ Yes (after API update) |

## Quick Start

To see video cycling on beats:
1. Upload videos
2. Upload audio (wait for analysis)
3. Enable markers (show onsets/MIDI)
4. Apply marker density changes
5. **Enable Video Cycling** in Triggers & Effects
6. Set "Swap Every N Markers" to 1 (every beat) or 4 (every 4 beats)
7. Play audio

The video should now cycle on beats! 🎵🎬
