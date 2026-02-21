# Claude Project Guidelines - Svelte Video Shaders

This document provides context and guidelines for working on the Svelte Video Shaders project.

## Project Overview

A high-performance video processing application built with **Svelte 5** that provides real-time shader effects using:
- **WebCodecs API** - Hardware-accelerated video decoding (H.264/MP4)
- **Three.js + WebGL** - Real-time GLSL shader rendering
- **Essentia.js** - Audio analysis for audio-reactive effects
- **Tweakpane** - Interactive parameter controls

**Target performance**: 60fps @ 1080p with minimal CPU overhead

## Architecture & Key Patterns

### Core Components

1. **ShaderPlayer.svelte** - Main renderer
   - Manages Three.js scene/camera/renderer
   - Handles frame requests from WebCodecs VideoDecoder
   - Updates uniforms and calls render loop
   - Cleanup on unmount

2. **VideoControls.svelte** - Tweakpane UI
   - Defines shader parameter bindings
   - Audio file upload and analysis (Essentia.js)
   - Tweakpane folder organization

3. **Shader Modules** (src/lib/shaders/)
   - Each shader exports `fragmentShader` (string) and `uniforms` (object)
   - Standard uniforms: `u_texture`, `u_resolution`, `u_time`
   - Audio-reactive: `u_audioLevel`, `u_bassLevel`, `u_midLevel`, `u_trebleLevel`

### Svelte 5 Runes Usage

This project heavily uses Svelte 5 runes for state management:
- `$state` - Reactive state (video frame, current shader, parameters)
- `$derived` - Computed values (e.g., derived from audio analysis)
- `$effect` - Side effects (DOM setup, cleanup, listeners)

Avoid `onMount`/`onDestroy` - use `$effect` instead.

## Development Workflow

### Setup
```bash
bun install
bun run dev  # Starts at http://localhost:5173
```

### Build & Test
```bash
bun run build      # Production build
bun run lint       # Prettier + ESLint
bun run format     # Auto-format code
bun run test       # Run vitest suite
bun run storybook  # Component preview
```

### Common Tasks

**Adding a new shader:**
1. Create `src/lib/shaders/my-shader.js` with `fragmentShader` and `uniforms` exports
2. Import in VideoControls and add to shader selection dropdown
3. Define Tweakpane folder structure in VideoControls for parameters
4. Test audio-reactivity if applicable

**Debugging WebCodecs issues:**
- Check `chrome://gpu` for hardware acceleration status
- Browser console shows VideoDecoder creation logs
- Verify video is H.264 encoded MP4 (use `ffmpeg -i video.mp4`)

**Performance optimization:**
- Profile with Chrome DevTools Perf tab (target: 60fps)
- VideoFrames are auto-released after upload to prevent leaks
- Three.js renderer targets `window.devicePixelRatio` for sharpness

## Code Standards

- **Formatting**: Prettier (auto-format on save in VSCode)
- **Linting**: ESLint with Svelte plugin
- **Style**: Tailwind CSS (utility-first)
- **Testing**: Vitest with browser support

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `three` | WebGL shader rendering |
| `essentia.js` | Audio analysis (FFT, frequency bands) |
| `mp4box` | MP4 file parsing for metadata |
| `tweakpane` + `svelte-tweakpane-ui` | Interactive UI controls |
| `peaks.js` | Waveform visualization |
| `mediabunny` | Media utilities |

## Browser Support

- ✅ **Chrome 94+** (Recommended - full WebCodecs support)
- ✅ **Edge 94+**
- ❌ **Firefox** - WebCodecs behind experimental flag
- ❌ **Safari** - No WebCodecs implementation

## Important Notes

- **WebCodecs is async** - Always await decoder operations
- **GLSL uniforms must match shader** - Type mismatches cause silent failures
- **Audio context** - Requires user interaction to start (click event)
- **Hardware limits** - Very high resolution videos (4K+) may exceed GPU memory

## Useful Files to Know

- `src/lib/ShaderPlayer.svelte` - Core renderer logic
- `src/lib/VideoControls.svelte` - Tweakpane setup and audio handling
- `src/lib/shaders/` - Fragment shader definitions
- `src/routes/+page.svelte` - Main app layout
- `svelte.config.js` - SvelteKit configuration
- `.eslintrc.js` - Linting rules

## Testing Strategy

- **Unit tests** use Vitest
- **Component tests** in Storybook
- **Browser tests** use Vitest + Playwright
- Focus on shader parameter validation and WebCodecs error handling
