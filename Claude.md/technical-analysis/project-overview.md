# Svelte Video Shaders - Project Overview

## Architecture Summary

### Core Technology Stack
- **Frontend Framework**: Svelte 5 with runes syntax
- **3D Rendering**: Three.js + WebGL
- **Video Processing**: WebCodecs API for hardware-accelerated decoding
- **MP4 Parsing**: MP4Box.js for container parsing and AVC config extraction
- **UI Controls**: Tweakpane UI (svelte-tweakpane-ui)
- **Build Tool**: Vite with SvelteKit

### Video Processing Pipeline

```
Video File Upload
    ↓
MP4Box.js Parser
    ↓
Extract AVC Configuration
    ↓
WebCodecs VideoDecoder
    ↓
Decoded VideoFrames
    ↓
Three.js Texture Upload
    ↓
Custom Fragment Shaders
    ↓
WebGL Rendering
```

## Key Components

### 1. ShaderPlayer.svelte
**Primary responsibility**: Video rendering and shader application
**Key features**:
- WebCodecs integration
- Three.js scene management
- Shader material handling
- Video texture updates

**Current issues**:
- Using MeshBasicMaterial instead of ShaderMaterial
- Duplicate video processing pipelines
- Missing vertex shader for custom materials

### 2. VideoControls.svelte
**Primary responsibility**: UI controls for video management
**Key features**:
- File upload handling
- Playback controls (play/pause/frame step)
- Video library with thumbnails
- Tweakpane integration

**Status**: Working correctly

### 3. +page.svelte
**Primary responsibility**: Main application layout and shader definitions
**Key features**:
- Shader library (Grayscale, Vignette)
- Uniform parameter controls
- App layout and component integration

**Status**: Working correctly

## Dependencies Analysis

### Core Dependencies
```json
{
  "three": "^0.178.0",           // 3D rendering
  "mp4box": "^1.2.0",          // MP4 parsing
  "mediabunny": "^1.0.3",      // Video utilities
  "svelte-tweakpane-ui": "^1.5.9", // UI controls
  "tweakpane": "^4.0.5"        // UI controls base
}
```

### Development Tools
- ESLint + Prettier for code quality
- Vitest for testing
- Storybook for component development
- Playwright for E2E testing

## Current State

### ✅ Working Features
- File upload via Tweakpane UI
- MP4 parsing and track extraction
- AVC configuration extraction
- WebCodecs VideoDecoder setup
- Frame decoding and reception
- Texture creation and updates
- UI controls and parameter binding

### ❌ Known Issues
- **Black Screen**: Primary issue - shaders not rendering
- **Duplicate Code**: Two video processing pipelines
- **Material Type**: Wrong Three.js material for custom shaders

### 📋 Development Plan Status
Based on DEVELOPMENT_PLAN.md:
- Upload functionality: ✅ Fixed
- Video processing: ✅ Working (frames decode)
- Shader rendering: ❌ Broken (material issue)
- UI unification: ✅ Complete

## Browser Requirements

### WebCodecs API Support
- Chrome 94+ ✅
- Edge 94+ ✅
- Firefox: ❌ Not supported
- Safari: ❌ Not supported

### Fallback Strategy
Currently no fallback for non-WebCodecs browsers. Consider:
- Video element fallback
- Software decoding alternatives
- Feature detection and graceful degradation