# Svelte Video Shaders

A real-time video shader playground built with SvelteKit, WebCodecs API, MP4Box, and Three.js for applying custom GLSL shaders to video content.

## Overview

This project enables real-time video processing using modern web technologies:

- **Video Playback**: WebCodecs API + MP4Box for frame-by-frame decoding
- **Rendering**: Three.js with custom GLSL shaders
- **UI Controls**: Tweakpane for real-time parameter adjustment
- **Framework**: SvelteKit 2.x with Svelte 5 runes

## Current Status (2025-01-07)

### ✅ Working Features
- WebCodecs video decoding with MP4Box demuxing
- VideoFrame lifecycle management (memory leak prevention)
- VideoTexture creation with proper dimensions
- Enhanced debug logging for troubleshooting
- Click-to-play overlay
- Multiple shader presets (Passthrough, RGB Shift, Grayscale, Noise, Vignette)
- Real-time parameter controls via Tweakpane

### 🔍 Current Issue
**Video shows first frame but doesn't play continuously**
- First frame loads and displays correctly
- Subsequent frames not advancing/playing
- Enhanced logging added to debug sample extraction and frame processing
- Investigation ongoing for continuous playback mechanism

### 🚧 Next Debug Steps
1. Check console for multiple `mp4box.onSamples` callbacks
2. Verify VideoDecoder is processing multiple chunks
3. Confirm frame output callback is called continuously
4. Investigate timing/playback control

## Technology Stack

- **Core**: SvelteKit 2.16.0, Svelte 5.0.0
- **Video**: WebCodecs API (browser-native), mp4box 1.2.0
- **3D/Shaders**: Three.js 0.178.0
- **UI**: svelte-tweakpane-ui 1.5.9, tweakpane 4.0.5
- **Build**: Vite 6.2.6
- **Styling**: TailwindCSS 4.0.0

## Development

### Prerequisites
- Node.js 18+
- pnpm (recommended) or npm

### Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Open browser to http://localhost:5173
```

### Browser Compatibility
- **Full Support**: Chrome 94+, Edge 94+, Safari 16.4+
- **Fallback**: HTML5 video for unsupported browsers (e.g., Firefox)

## Project Structure

```
src/
├── lib/
│   ├── ShaderPlayer.svelte    # Main WebCodecs player component
│   └── FileInput.svelte       # Tweakpane file upload wrapper
├── routes/
│   └── +page.svelte          # Main app with controls
└── stories/                  # Storybook components
```

## Key Implementation Details

### WebCodecs Integration
- Uses MP4Box for MP4 container demuxing
- VideoDecoder for frame-by-frame decoding
- Proper VideoFrame lifecycle management (critical for memory)
- Three.js VideoTexture for GPU-optimized rendering

### Shader System
- Real-time GLSL fragment shader processing
- Uniform parameter binding for interactive controls
- OrthographicCamera for 2D video plane rendering

## Documentation

- **CLAUDE.md**: Project memory and implementation status
- **docs/**: Detailed planning and architecture decisions
- **.cursor/rules/**: Development guidelines and best practices

## Contributing

See CLAUDE.md for current implementation status and next steps. The project follows Svelte 5 syntax conventions and WebCodecs best practices.

## License

[Add license information]