# Video Pipeline Analysis

## Complete Pipeline Flow

### 1. File Upload Stage
**Location**: `VideoControls.svelte:38-80`
```javascript
handleUploadClick() → fileInput.click() → onFileSelected()
```
**Status**: ✅ Working correctly

### 2. Video Asset Management
**Location**: `VideoControls.svelte:50-80`
- Creates video asset with UUID
- Generates object URL
- Adds to videoAssets store
- Sets as activeVideo if first upload
- Generates thumbnail via mediabunny

**Status**: ✅ Working correctly

### 3. Video Processing Initialization
**Location**: `ShaderPlayer.svelte:302-538` (start function)
- Creates MP4Box file instance
- Sets up onReady and onSamples handlers
- Reads file as ArrayBuffer
- Appends to MP4Box for parsing

**Status**: ✅ Working correctly

### 4. MP4 Parsing & Track Extraction
**Location**: `ShaderPlayer.svelte:317-340`
```javascript
mp4boxfile.onReady = (info) => {
    const videoTrack = info.tracks.find(t => t.type === 'video');
    // Extract AVC configuration for WebCodecs
}
```
**Status**: ✅ Working correctly

### 5. WebCodecs Configuration
**Location**: `ShaderPlayer.svelte:420-503`
- Extracts AVC configuration from MP4Box track data
- Configures VideoDecoder with proper codec parameters
- Handles H.264/AVC description extraction

**Key Code**:
```javascript
const config = {
    codec: videoTrack.codec,
    codedWidth: videoTrack.track_width,
    codedHeight: videoTrack.track_height,
    description: avcCBuffer // Extracted from MP4Box
};
videoDecoder.configure(config);
```
**Status**: ✅ Working correctly

### 6. Frame Decoding
**Location**: `ShaderPlayer.svelte:513-526`
```javascript
mp4boxfile.onSamples = (track_id, user, samples) => {
    for (const sample of samples) {
        const chunk = new EncodedVideoChunk({
            type: sample.is_sync ? 'key' : 'delta',
            timestamp: sample.cts,
            data: sample.data
        });
        videoDecoder.decode(chunk);
    }
};
```
**Status**: ✅ Working correctly

### 7. Frame Output Handling
**Location**: `ShaderPlayer.svelte:342-412`
```javascript
videoDecoder = new VideoDecoder({
    output: (frame) => {
        // Update Three.js texture with VideoFrame
        // Direct WebGL upload via texSubImage2D
    }
});
```
**Status**: ✅ Working (frames received and logged)

### 8. Three.js Texture Upload
**Location**: `ShaderPlayer.svelte:375-408`
- Force Three.js texture initialization
- Get WebGL texture handle
- Direct upload via `gl.texSubImage2D()`
- Fallback to Three.js automatic handling

**Status**: ✅ Working (no WebGL errors)

### 9. Material & Shader Rendering
**Location**: `ShaderPlayer.svelte:67-70` and `576-582`
```javascript
// PROBLEM: Using MeshBasicMaterial
material = new THREE.MeshBasicMaterial({ map: texture });

// PROBLEM: Trying to set custom shader on basic material
$effect(() => {
    if (material && fragmentShader) {
        material.fragmentShader = fragmentShader; // Won't work!
        material.needsUpdate = true;
    }
});
```
**Status**: ❌ **ROOT CAUSE OF BLACK SCREEN**

## Pipeline Performance

### Successful Steps
1. ✅ File upload and asset creation
2. ✅ MP4Box parsing and track extraction  
3. ✅ AVC configuration extraction
4. ✅ WebCodecs VideoDecoder configuration
5. ✅ Frame decoding (hardware accelerated)
6. ✅ VideoFrame to WebGL texture upload
7. ✅ Three.js render loop execution

### Failure Point
8. ❌ **Shader material rendering** - frames reach GPU but aren't visible due to material type mismatch

## Debug Evidence

### Console Logs Show Success Until Rendering
```
[Tracer] videoDecoder.output: Frame received, updating texture directly
[Tracer] videoDecoder.output: Successfully uploaded VideoFrame to WebGL texture
[Tracer] render: Rendering frame {scene: true, camera: true, mesh: true, ...}
```

### No WebGL Errors
- No `GL_INVALID_VALUE` errors
- No `GL_INVALID_OPERATION` errors  
- No texture binding failures
- No shader compilation errors (because no custom shaders compiled)

## Required Fix

Replace MeshBasicMaterial with ShaderMaterial to enable custom fragment shader rendering:

```javascript
// Add vertex shader
const vertexShader = `
    varying vec2 v_uv;
    void main() {
        v_uv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// Use ShaderMaterial instead
material = new THREE.ShaderMaterial({
    uniforms: {
        u_texture: { value: texture },
        ...uniforms
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader || defaultFragmentShader
});
```