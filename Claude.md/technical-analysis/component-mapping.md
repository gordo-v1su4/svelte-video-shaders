# Component Mapping & Responsibilities

## File Structure Overview

```
src/
├── lib/
│   ├── ShaderPlayer.svelte     # Video rendering & shader application
│   ├── VideoControls.svelte    # Upload & playback controls  
│   ├── stores.js              # Reactive stores for app state
│   ├── video-utils.js         # Video utility functions
│   └── index.js               # Library exports
├── routes/
│   ├── +page.svelte           # Main application layout
│   ├── +layout.svelte         # App shell layout
│   └── +layout.js             # Layout configuration
└── app.html                   # HTML template
```

## Component Responsibilities

### ShaderPlayer.svelte
**Primary Role**: Video rendering engine with WebCodecs + Three.js

**Key Functions**:
- `loadVideo(videoFile)` - Alternative video loading (lines 105-132)
- `initializeVideoProcessing(videoFile)` - MP4Box setup (lines 134-183)
- `setupVideoDecoder(videoTrack)` - WebCodecs configuration (lines 185-229)
- `handleVideoFrame(frame)` - Frame processing (lines 231-256)
- `start()` - Main video processing pipeline (lines 302-538)
- `play()`, `pause()` - Playback controls (lines 540-552)

**Props**:
- `file` - Video file to process
- `fragmentShader` - Custom fragment shader code
- `uniforms` - Shader uniform parameters

**State**:
- `canvas` - WebGL canvas element
- `showOverlay` - Play button overlay visibility
- `isPlaying` - Playback state
- Three.js objects: `renderer`, `scene`, `camera`, `material`, `texture`, `mesh`
- WebCodecs objects: `videoDecoder`, `mp4boxfile`

**Issues**:
- Lines 105-256: Unused/duplicate video processing code
- Line 67: Wrong material type (MeshBasicMaterial vs ShaderMaterial)
- Lines 576-582: Invalid shader property setting

### VideoControls.svelte  
**Primary Role**: Video management UI within Tweakpane

**Key Functions**:
- `handleUploadClick()` - Triggers file selection (lines 38-48)
- `onFileSelected(event)` - Processes uploaded file (lines 50-80)
- `handlePlay()`, `handlePause()` - Playback control delegation (lines 10-36)
- `handleVideoSelect(asset)` - Switch active video (lines 82-84)

**Props**:
- `shaderPlayerRef` - Reference to ShaderPlayer component

**Dependencies**:
- `videoAssets` store - List of uploaded videos
- `activeVideo` store - Currently selected video
- `generateThumbnail()` from video-utils.js

**Status**: ✅ Working correctly

### +page.svelte
**Primary Role**: Main application shell and shader definitions

**Key Features**:
- Shader library definitions (lines 7-32)
- Tweakpane UI layout (lines 48-82)
- ShaderPlayer component integration (lines 86-93)
- Uniform parameter management (lines 34-39)

**Shader Definitions**:
```javascript
const shaders = {
    Grayscale: `varying vec2 v_uv; uniform sampler2D u_texture; ...`,
    Vignette: `varying vec2 v_uv; uniform sampler2D u_texture; ...`
};
```

**Status**: ✅ Working correctly

## Store Architecture

### stores.js
**Exports**:
- `videoAssets` - Writable store for uploaded video list
- `activeVideo` - Writable store for currently selected video

**Usage Pattern**:
```javascript
// Add new video
videoAssets.update(assets => [...assets, newAsset]);

// Set active video  
activeVideo.set(selectedAsset);

// React to changes
{#if $activeVideo}
    <ShaderPlayer file={$activeVideo.file} />
{/if}
```

## Data Flow

### Video Upload Flow
```
User clicks upload → VideoControls → File input → onFileSelected()
                                                      ↓
Create asset object → Update videoAssets store → Set activeVideo
                                                      ↓
Generate thumbnail → Update asset with thumbnail URL
```

### Video Processing Flow  
```
activeVideo changes → +page.svelte detects → ShaderPlayer recreated
                                                      ↓
ShaderPlayer.start() → MP4Box parsing → WebCodecs decode → Texture update
```

### Shader Update Flow
```
User changes shader → +page.svelte uniforms update → ShaderPlayer $effect
                                                            ↓
Material uniform update (currently broken due to material type)
```

## Integration Points

### ShaderPlayer ↔ VideoControls
- VideoControls holds reference to ShaderPlayer
- Playback buttons call ShaderPlayer methods
- File selection triggers ShaderPlayer video loading

### +page.svelte ↔ ShaderPlayer  
- Fragment shader and uniforms passed as props
- ShaderPlayer bound for VideoControls reference
- Key-based component recreation on video change

### Stores ↔ All Components
- Reactive updates propagate automatically
- Consistent state across component tree
- Thumbnail and video asset management

## Critical Integration Issue

**Problem**: ShaderPlayer receives fragment shaders but can't apply them due to MeshBasicMaterial
**Impact**: Video renders but shaders have no effect  
**Solution**: Replace with ShaderMaterial in ShaderPlayer.svelte:67