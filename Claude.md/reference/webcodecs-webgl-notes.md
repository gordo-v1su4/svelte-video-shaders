# WebCodecs + WebGL Reference Guide

## WebCodecs API Overview

### Browser Support
```javascript
// Feature detection
if (!window.VideoDecoder) {
    console.error('WebCodecs API not supported');
    // Implement fallback
}
```

**Supported Browsers**:
- Chrome 94+ ✅
- Edge 94+ ✅  
- Firefox ❌ (as of 2025)
- Safari ❌ (as of 2025)

### VideoDecoder Configuration
```javascript
const decoder = new VideoDecoder({
    output: (frame) => {
        // Process decoded VideoFrame
        processFrame(frame);
        frame.close(); // Always close to prevent memory leaks
    },
    error: (error) => {
        console.error('Decoder error:', error);
    }
});

// Configuration for H.264/AVC
const config = {
    codec: 'avc1.42E01E',  // H.264 baseline profile
    codedWidth: 1920,      // Video width
    codedHeight: 1080,     // Video height
    description: avcCData  // Required for H.264 - from MP4Box
};

decoder.configure(config);
```

### H.264 Description Extraction
```javascript
// Extract AVC configuration from MP4Box
const trackInfo = mp4boxfile.getTrackById(videoTrack.id);
const stsd = trackInfo.mdia.minf.stbl.stsd;
const avcC = stsd.entries[0].avcC;

// Convert to ArrayBuffer for WebCodecs
let description = null;
if (avcC && avcC.config) {
    description = new Uint8Array(avcC.config);
}
```

## WebGL Integration Patterns

### VideoFrame to Texture Upload
```javascript
// Method 1: Direct WebGL upload (preferred for performance)
const gl = renderer.getContext();
const glTexture = renderer.properties.get(texture).__webglTexture;

gl.bindTexture(gl.TEXTURE_2D, glTexture);
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame);
gl.bindTexture(gl.TEXTURE_2D, null);

// Method 2: Canvas intermediate (fallback)
const canvas = document.createElement('canvas');
canvas.width = frame.displayWidth;
canvas.height = frame.displayHeight;
const ctx = canvas.getContext('2d');
ctx.drawImage(frame, 0, 0);
texture.image = canvas;
texture.needsUpdate = true;
```

### Three.js Texture Handling
```javascript
// Create texture with proper format
const texture = new THREE.DataTexture(
    null,                    // data - will be updated with VideoFrame
    videoWidth,              // width
    videoHeight,             // height  
    THREE.RGBAFormat,        // format
    THREE.UnsignedByteType   // type
);

// For immutable textures (Three.js default with texStorage2D)
// Use texSubImage2D instead of texImage2D
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame);
```

## Shader Material Setup

### Vertex Shader Template
```glsl
// Standard vertex shader for video textures
varying vec2 v_uv;

void main() {
    v_uv = uv;  // Pass UV coordinates to fragment shader
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

### Fragment Shader Template  
```glsl
// Base fragment shader for video texture
varying vec2 v_uv;
uniform sampler2D u_texture;

void main() {
    vec4 color = texture2D(u_texture, v_uv);
    gl_FragColor = color;
}
```

### ShaderMaterial Configuration
```javascript
const material = new THREE.ShaderMaterial({
    uniforms: {
        u_texture: { value: videoTexture },
        u_time: { value: 0.0 },
        // ... custom uniforms
    },
    vertexShader: vertexShaderSource,
    fragmentShader: fragmentShaderSource,
    transparent: false,
    side: THREE.FrontSide
});
```

## Common Patterns & Best Practices

### Frame Lifecycle Management
```javascript
// Proper frame handling
decoder.output = (frame) => {
    try {
        // Process frame (upload to texture, etc.)
        processVideoFrame(frame);
    } finally {
        // Always close frame to prevent memory leaks
        frame.close();
    }
};
```

### Error Handling
```javascript
// Comprehensive error handling
try {
    const chunk = new EncodedVideoChunk({
        type: sample.is_sync ? 'key' : 'delta',
        timestamp: sample.cts * 1000,  // Convert to microseconds
        data: sample.data
    });
    
    if (decoder.state === 'configured') {
        decoder.decode(chunk);
    }
} catch (error) {
    console.error('Chunk decode error:', error);
    // Handle decode failure
}
```

### Performance Optimizations
```javascript
// Batch texture updates
let frameQueue = [];
let isProcessing = false;

decoder.output = (frame) => {
    frameQueue.push(frame);
    if (!isProcessing) {
        processFrameQueue();
    }
};

function processFrameQueue() {
    isProcessing = true;
    requestAnimationFrame(() => {
        // Process all queued frames
        while (frameQueue.length > 0) {
            const frame = frameQueue.shift();
            updateTexture(frame);
            frame.close();
        }
        isProcessing = false;
    });
}
```

## Debugging Tools

### WebCodecs Debug Logging
```javascript
// Comprehensive decoder logging
const decoder = new VideoDecoder({
    output: (frame) => {
        console.log(`Frame: ${frame.timestamp}μs, ${frame.displayWidth}x${frame.displayHeight}`);
        console.log(`Format: ${frame.format}, Duration: ${frame.duration}μs`);
        // Process frame...
    },
    error: (error) => {
        console.error('Decoder error:', error.message);
        console.error('Decoder state:', decoder.state);
    }
});

// Monitor decoder state changes
Object.defineProperty(decoder, 'state', {
    set: (value) => {
        console.log(`Decoder state changed to: ${value}`);
    }
});
```

### WebGL Debug Helpers
```javascript
// Check for WebGL errors
function checkGLError(gl, operation) {
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
        console.error(`WebGL Error after ${operation}: ${error}`);
        return false;
    }
    return true;
}

// Validate texture upload
gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame);
checkGLError(gl, 'texSubImage2D with VideoFrame');
```

## Known Issues & Solutions

### Issue: "GL_INVALID_VALUE" on texSubImage2D
**Cause**: Texture dimensions don't match VideoFrame dimensions
**Solution**: Recreate texture with correct dimensions on first frame

### Issue: "Can't texture a closed VideoFrame"  
**Cause**: Frame closed before WebGL upload
**Solution**: Store frame reference, close after upload

### Issue: Black screen with successful frame processing
**Cause**: Using MeshBasicMaterial instead of ShaderMaterial  
**Solution**: Use ShaderMaterial for custom fragment shaders

### Issue: Memory leaks with VideoFrame
**Cause**: Not calling frame.close()
**Solution**: Always close frames in finally block

## Reference Implementation
See: https://github.com/w3c/webcodecs/tree/main/samples/video-decode-display

This contains canonical examples of:
- MP4 parsing with MP4Box.js
- WebCodecs VideoDecoder setup
- VideoFrame to WebGL texture upload
- Proper resource management