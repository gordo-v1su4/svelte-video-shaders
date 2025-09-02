# Video Shaders

A modern web application for real-time video processing and shader effects, built with Svelte 5 and powered by WebCodecs API for hardware-accelerated video decoding.

## 🎬 Features

- **Hardware-Accelerated Video Decoding**: Uses WebCodecs API for efficient H.264 video processing
- **Real-Time Shader Effects**: WebGL/Three.js powered video rendering with custom shaders
- **Interactive Controls**: Tweakpane UI for real-time parameter adjustment
- **Advanced MP4 Support**: MP4Box.js integration for robust video file parsing
- **Browser-Native Performance**: Direct VideoFrame-to-WebGL texture uploads

## 🏗️ Architecture

- **Frontend**: Svelte 5 with runes
- **Video Processing**: WebCodecs API + MP4Box.js
- **Rendering**: Three.js + WebGL
- **UI**: Tweakpane for interactive controls
- **Media Utils**: Mediabunny library

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Modern browser with WebCodecs support (Chrome 94+, Edge 94+)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd svelte-video-shaders

# Install dependencies
bun install

# Start development server
bun run dev
```

### Usage

1. **Upload Video**: Click the upload button in the Tweakpane UI
2. **Select MP4 File**: Choose an H.264 encoded MP4 video
3. **Apply Shaders**: Use the controls to adjust shader parameters in real-time
4. **Enjoy**: Watch your video with custom shader effects!

## 🛠️ Development

### Development Server

```bash
bun run dev

# Open in browser automatically
bun run dev -- --open
```

### Building for Production

```bash
bun run build
```

### Preview Production Build

```bash
bun run preview
```

## 📁 Project Structure

```
svelte-video-shaders/
├── src/
│   ├── lib/
│   │   ├── ShaderPlayer.svelte    # Main video rendering component
│   │   └── VideoControls.svelte   # Tweakpane UI controls
│   ├── routes/
│   │   └── +page.svelte           # Main application page
│   └── app.html
├── mediabunny/                    # Video processing utilities
├── static/                        # Static assets
├── DEVELOPMENT_PLAN.md           # Detailed development notes
└── package.json
```

## 🔧 Technical Details

### Video Processing Pipeline

1. **File Upload** → Tweakpane UI file dialog
2. **MP4 Parsing** → MP4Box.js extracts video track + AVC config
3. **WebCodecs Setup** → VideoDecoder configured with H.264 parameters
4. **Frame Decoding** → Hardware-accelerated decoding to VideoFrames
5. **WebGL Upload** → Direct VideoFrame-to-texture using `gl.texSubImage2D`
6. **Shader Rendering** → Three.js renders with custom fragment shaders

### Key Technologies

- **WebCodecs API**: Browser-native video decoding
- **MP4Box.js**: Robust MP4 file parsing and AVC configuration extraction
- **Three.js**: WebGL abstraction for shader rendering
- **Tweakpane**: Interactive parameter controls
- **Svelte 5**: Reactive UI with runes

### Browser Compatibility

- **Chrome 94+**: Full WebCodecs support
- **Edge 94+**: Full WebCodecs support
- **Firefox**: Limited (WebCodecs behind flag)
- **Safari**: Not supported (WebCodecs not implemented)

## 📚 Documentation

- [Development Plan](./DEVELOPMENT_PLAN.md) - Detailed development notes and task list
- [Mediabunny Docs](./mediabunny/docs/) - Video processing utilities documentation
- [Tweakpane UI Docs](https://kitschpatrol.com/svelte-tweakpane-ui/docs) - UI controls documentation

## 🔍 Debugging

For detailed debugging information, check:

1. **Browser Console**: Look for `[Tracer]` prefixed logs
2. **WebCodecs Support**: Ensure browser supports VideoDecoder
3. **File Format**: Use H.264 encoded MP4 files
4. **Development Plan**: Check `DEVELOPMENT_PLAN.md` for current issues

## 🤝 Contributing

Contributions are welcome! Please check the [Development Plan](./DEVELOPMENT_PLAN.md) for current tasks and known issues.

## 📄 License

[MIT License](LICENSE) - Feel free to use this project for your own video shader experiments!

---

**Note**: This project requires a modern browser with WebCodecs API support for hardware-accelerated video decoding.
