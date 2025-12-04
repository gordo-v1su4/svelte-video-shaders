# Svelte Video Shaders

**Real-time video shader effects using WebCodecs API, WebGL/Three.js, and Svelte 5 runes.**

A high-performance video processing application that uses browser-native WebCodecs API for hardware-accelerated video decoding and Three.js for real-time shader-based effects.

## Features

- **Hardware-Accelerated Video Decoding** - Smooth 60fps playback via WebCodecs API
- **Real-time GLSL Shaders** - Custom fragment shaders with Three.js
- **Audio-Reactive Effects** - Shaders respond to audio frequency analysis
- **Svelte 5 Runes** - Built with modern Svelte 5 syntax (`$state`, `$derived`, `$effect`)
- **Tweakpane UI** - Intuitive real-time parameter controls
- **Responsive Design** - Scales to any viewport size

## Quick Start

### Prerequisites

- **Bun** package manager (faster than npm/pnpm)
- Chrome 94+ or Edge 94+ (WebCodecs support required)

Install Bun:
```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1|iex"

# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

### Install & Run (2 Commands)

```bash
# 1. Install dependencies
bun install

# 2. Start development server
bun run dev
```

The app will open at: **http://localhost:5173**

### Build Commands

```bash
# Development server (with hot reload)
bun run dev

# Production build
bun run build

# Preview production build
bun run preview

# Run all tests
bun run test
```

## Usage

1. **Upload Video**: Drag & drop or click "Select Video" button
2. **Select Shader**: Choose from VHS, Grayscale, or Vignette effects
3. **Adjust Parameters**: Use Tweakpane controls to tweak shader settings
4. **Upload Audio** (for XlsczN shader): Audio-reactive effects will synchronize
5. **Control Playback**: Play, pause, and stop with controls

## Tech Stack

- **Svelte 5** - Modern reactive framework with runes
- **WebCodecs API** - Hardware-accelerated video decoding
- **Three.js** - WebGL shader rendering
- **MP4Box.js** - MP4 file parsing
- **Tweakpane** - UI controls
- **Vite** - Build tooling
- **Bun** - Package manager (fast, reliable)

## Browser Compatibility

- ✅ Chrome 94+ (Recommended)
- ✅ Edge 94+
- ❌ Firefox (WebCodecs behind flag, experimental)
- ❌ Safari (WebCodecs not implemented)

## Development Notes

### Video Format Requirements

- MP4 container
- H.264 (AVC) video codec
- Any resolution supported by hardware decoder

### Audio Format Requirements

- Most formats supported via browser `<audio>` tag
- For audio-reactive features: MP3, WAV, or OGG recommended

### Project Structure

```
src/
├── lib/
│   ├── ShaderPlayer.svelte    # Main shader renderer
│   ├── VideoControls.svelte   # Tweakpane UI
│   └── shaders/               # GLSL shader files
│       ├── vhs-shader.js
│       └── xlsczn-shader.js
├── routes/
│   └── +page.svelte           # Main app page
└── app.html
```

### Shader Uniforms

All shaders receive these uniforms:

```glsl
uniform sampler2D u_texture;     // Video frame
uniform vec2 u_resolution;       // Canvas resolution
uniform float u_time;            // Elapsed time
// Plus shader-specific uniforms from Tweakpane
```

Audio-reactive shaders also get:

```glsl
uniform float u_audioLevel;      // Overall volume 0-1
uniform float u_bassLevel;       // Bass frequencies 0-1
uniform float u_midLevel;        // Mid frequencies 0-1
uniform float u_trebleLevel;     // Treble frequencies 0-1
```

## Performance

- **Target FPS**: 60fps @ 1080p
- **Memory**: VideoFrames auto-released after upload
- **GPU**: Hardware decoding + WebGL acceleration
- **CPU**: Minimal load (mostly async WebCodecs)

## Troubleshooting

### "Port 5173 already in use"
```bash
bun run dev -- --port 3000
```

### "WebCodecs not supported"
- Ensure Chrome/Edge 94+
- Check `chrome://gpu` for hardware acceleration
- May require HTTPS in some enterprise environments

### Video won't load
- Verify H.264 encoding: `ffmpeg -i video.mp4`
- Check file isn't corrupt by playing in browser directly
- Inspect browser console for specific errors

### Shaders not appearing
- Check WebGL support: `chrome://gpu`
- Inspect console for shader compilation errors
- Verify Three.js initialized: `window.THREE` in console

## License

MIT - Feel free to use for your own video processing projects!
