# CLAUDE.md - Project Memory for svelte-video-shaders

## Overview
Svelte-based video shader playground using WebCodecs API, MP4Box, and Three.js for real-time video processing with custom GLSL shaders.

## Key Architecture Rules (from .cursor/rules/)

### 1. Video Playback Technology Stack
- **PRIMARY**: WebCodecs API + MP4Box + Three.js (Chrome 94+, Edge 94+, Safari 16.4+)
- **FALLBACK**: HTML5 `<video>` element for unsupported browsers
- **AVOID**: FFmpeg.wasm for primary playback (use only for complex processing)

### 2. WebCodecs Best Practices
- **CRITICAL**: Always call `frame.close()` after using VideoFrame objects
- **Memory Management**: Dispose Three.js resources and close VideoDecoder on component destroy
- **State Management**: Follow unconfigured → configured → closed lifecycle
- **Error Handling**: Handle both promise rejections and error callbacks

### 3. MP4Box Integration
```javascript
// ✅ Correct import for Vite compatibility
import * as MP4Box from 'mp4box';
// OR
import { default as MP4BoxModule } from 'mp4box';
```

### 4. Three.js Patterns
- **Camera**: Use `OrthographicCamera` for 2D video planes (not PerspectiveCamera)
- **Sizing**: Definitive resize logic in `handleResize()` function
- **Render Loop**: Separate from decoding pipeline
- **Scale Factor**: 0.5 applied for half-size video rendering

### 5. Svelte 5 Syntax
- **Events**: Use `onclick`, `onchange`, etc. (not `on:click`, `on:change`)
- **State**: Use `$state()`, `$derived()`, `$effect()` runes
- **Props**: Use `let { prop } = $props()`
- **Accessibility**: Use underscore format (`a11y_click_events_have_key_events`)

### 6. Project Structure
```
src/
├── lib/
│   └── ShaderPlayer.svelte    # Main WebCodecs player component
├── routes/
│   └── +page.svelte          # Main app with Tweakpane controls
└── stories/                  # Storybook components
```

### 7. Dependencies
- **Core**: SvelteKit 2.16.0, Svelte 5.0.0, Three.js 0.178.0
- **Video**: mp4box 1.2.0, WebCodecs API (browser-native)
- **UI**: svelte-tweakpane-ui 1.5.9, tweakpane 4.0.5, tweakpane-plugin-file-import 1.1.1, @tweakpane/plugin-essentials 0.2.1
- **Build**: Vite 6.2.6, TailwindCSS 4.0.0

### 8. Development Commands
- `pnpm run dev` - Development server
- `pnpm run build` - Production build
- `pnpm run lint` - ESLint + Prettier check
- `pnpm run test` - Vitest unit tests

## Current Implementation (webcodecs-webgl branch)

### ShaderPlayer.svelte Features
- WebCodecs video decoding with MP4Box demuxing
- Three.js rendering with shader materials
- File-based input (not URL-based)
- Extensive debug logging with `[Tracer]` prefix
- Click-to-play overlay
- Automatic fallback to HTML5 video

### Main App Features
- Multiple video queue with thumbnails
- Real-time shader parameter controls
- Preset shaders: Passthrough, RGB Shift, Grayscale, Noise, Vignette
- Custom GLSL editor
- **Enhanced Tweakpane UI** with proper file upload, theme picker, and advanced controls

### Tweakpane Integration ✅
- **FileInput.svelte** wrapper component for reliable file uploads
- **Theme picker** with ThemeUtils.Selector
- **Plugin system** with file-import and essentials plugins
- **Proper event handling** avoiding DOM conflicts
- **Reactive file handling** with Svelte 5 $effect

## Technical Debt & Known Issues
- MP4Box import syntax needs verification (see PLAN.md)
- Frame-by-frame pipeline implementation incomplete
- Audio-reactive features not yet implemented
- Error handling could be more robust

## Performance Considerations
- Always close VideoFrame objects to prevent memory leaks
- Use OrthographicCamera for better 2D performance
- Buffer samples for smooth playback
- Separate render loop from decoding pipeline

## Browser Compatibility
- **Full Support**: Chrome 94+, Edge 94+, Safari 16.4+
- **Fallback Required**: Firefox (no WebCodecs support)
- **Headers Required**: COEP/COOP for SharedArrayBuffer support

## References
- Primary documentation: docs/PLAN.md, docs/research-changes.md, docs/GEMINI.md
- Cursor rules: .cursor/rules/ (7 files covering all aspects)
- Architecture decisions documented in GEMINI.md