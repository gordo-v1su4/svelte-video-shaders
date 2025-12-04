# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Core Workflow
```bash
# Install dependencies (must use Bun)
bun install

# Development server (port 5173, strict - will exit if port is occupied)
bun run dev

# Production build
bun run build

# Preview production build
bun run preview

# Run all tests (uses Vitest with Playwright browser testing)
bun run test

# Run tests in watch mode
bun run test:unit
```

### Code Quality
```bash
# Format all files with Prettier
bun run format

# Check formatting and lint
bun run lint

# Storybook for component development
bun run storybook         # Dev server on port 6006
bun run build-storybook   # Build static Storybook
```

## Architecture Overview

### WebCodecs + Three.js Pipeline
This application processes video in real-time using a sophisticated hardware-accelerated pipeline:

1. **MP4 Parsing** (`mp4box`): Demuxes MP4 containers to extract encoded video chunks
2. **Hardware Decoding** (WebCodecs API): Browser-native `VideoDecoder` decodes chunks to `VideoFrame` objects
3. **WebGL Rendering** (Three.js): `VideoFrame` → Canvas texture → Fragment shader → Display
4. **Audio Analysis** (Web Audio API): Separate real-time FFT analysis for audio-reactive effects

**Critical Memory Management**: WebCodecs `VideoFrame` objects **must** be explicitly closed with `frame.close()` after use. Failure to do so causes memory leaks and crashes. See `.cursor/rules/webcodecs-api.mdc` for detailed rules.

### File Organization
```
src/
├── lib/
│   ├── ShaderPlayer.svelte       # Core: WebCodecs decoder + Three.js renderer
│   ├── VideoControls.svelte      # UI: Tweakpane controls + file upload
│   ├── VideoWorkbench.svelte     # Container component
│   ├── FileInput.svelte          # File upload component
│   ├── video-utils.js            # Thumbnail generation with mediabunny
│   ├── audio-utils.js            # AudioAnalyzer class (FFT-based)
│   ├── stores.js                 # Svelte stores for video assets
│   └── shaders/
│       ├── vhs-shader.js         # VHS tape effect (distortion, scanlines, tracking)
│       └── xlsczn-shader.js      # Audio-reactive glitch shader (YIQ color space)
├── routes/
│   └── +page.svelte              # Main application entry
└── stories/                      # Storybook component stories
```

### Key Technical Details

#### WebCodecs Decoder (ShaderPlayer.svelte)
- Uses MP4Box.js `onReady` callback to configure `VideoDecoder` with codec info
- H.264 (AVC) videos **require** `description` field (AVCDecoderConfigurationRecord) in config
- Frame queue maintains 60fps playback with manual timing control
- Audio-reactive mode modifies playback speed (0.5x-2.5x) and performs jump cuts on bass beats
- All `VideoFrame` objects are explicitly closed to prevent memory leaks

#### Shader System
- **Base uniforms** (always available): `u_texture`, `u_resolution`, `u_time`
- **Audio uniforms** (xlsczn shader): `u_audioLevel`, `u_bassLevel`, `u_midLevel`, `u_trebleLevel`
- **VHS uniforms**: Distortion, scanline intensity, RGB shift, noise, flicker, tracking parameters
- Shaders use GLSL ES 1.0 (WebGL 1.0 compatibility)
- Fragment shaders process video frames in real-time (60fps target)

#### Audio Analysis
- Web Audio API `AnalyserNode` with FFT size 512
- Frequency ranges: Bass (20-250Hz), Mid (250-4000Hz), Treble (4000-20000Hz)
- Normalized output values (0-1) drive shader uniforms in real-time
- Audio playback synchronized separately from video (not frame-locked)

### Svelte 5 Patterns (Runes)
This codebase uses **Svelte 5 runes syntax**:
- `$state()` for reactive state
- `$derived()` for computed values
- `$effect()` for side effects
- `$props()` for component props
- Event handlers use `onclick` (not `on:click`)
- See `.cursor/rules/svelte-5-syntax.mdc` for comprehensive migration rules

### Critical Configuration

#### Vite Server (vite.config.js)
```javascript
// REQUIRED for WebCodecs API (SharedArrayBuffer)
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
These headers enable WebCodecs by providing the necessary cross-origin isolation.

#### Browser Requirements
- **Chrome/Edge 94+** (WebCodecs support)
- Hardware acceleration enabled (check `chrome://gpu`)
- Firefox/Safari: WebCodecs not supported or experimental

#### Video Format Requirements
- MP4 container with H.264 (AVC) codec
- Any resolution supported by hardware decoder
- For audio-reactive features: separate audio file (MP3/WAV/OGG)

### Testing Strategy
- **Unit Tests**: Vitest with `@vitest/browser` using Playwright/Chromium
- **Component Tests**: Files matching `src/**/*.svelte.{test,spec}.{js,ts}`
- **Server Tests**: Files matching `src/**/*.{test,spec}.{js,ts}` (non-Svelte)
- Tests require browser environment due to WebCodecs/WebGL dependencies

### Common Pitfalls
1. **VideoFrame Memory Leaks**: Always call `frame.close()` after rendering
2. **H.264 Missing Description**: Extract `AVCDecoderConfigurationRecord` from MP4 metadata
3. **Cross-Origin Headers**: Missing headers cause `SharedArrayBuffer is not defined` errors
4. **Port Conflicts**: Vite uses strict port mode - must use `--port` flag to change
5. **Audio Context Suspended**: Call `audioContext.resume()` after user interaction

### Code Style
- **Tabs** (not spaces) - enforced by Prettier
- **Single quotes** for strings
- **No trailing commas**
- **100 character line width**
- Svelte files use `prettier-plugin-svelte`
- ESLint with Svelte plugin + Storybook rules

## Project-Specific Notes
- Uses `mediabunny` library for thumbnail generation (simplified WebCodecs abstraction)
- Tweakpane UI controls are integrated via `svelte-tweakpane-ui` wrapper
- Video dimensions are read from first decoded frame and used for aspect ratio calculations
- Audio analyzer runs in separate loop from video playback (not synchronized at frame level)
- Frame rate is controlled manually (24fps default) via `FRAME_DURATION_MS` constant
