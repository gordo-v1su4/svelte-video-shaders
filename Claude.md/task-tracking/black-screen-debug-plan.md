# Black Screen Debug Plan

## Issue Summary
Video uploads successfully, WebCodecs decode frames, texture updates occur, but screen remains black.

## Root Cause Analysis

### ✅ Confirmed Working
- File upload functionality
- MP4Box.js video parsing
- WebCodecs VideoDecoder configuration
- AVC configuration extraction
- Frame decoding (logs show frames received)
- Texture creation and updates

### ❌ Identified Issues

#### 1. **ShaderMaterial vs MeshBasicMaterial** (Primary Issue)
**Location**: `src/lib/ShaderPlayer.svelte:67`
```javascript
// Current incorrect implementation:
material = new THREE.MeshBasicMaterial({ map: texture });

// Lines 576-582 try to set fragmentShader on MeshBasicMaterial
material.fragmentShader = fragmentShader; // This won't work!
```

**Problem**: MeshBasicMaterial doesn't support custom fragment shaders. Need ShaderMaterial.

#### 2. **Missing Vertex Shader**
Custom ShaderMaterial requires both vertex and fragment shaders.

#### 3. **Uniform Binding Issues**
Custom shaders need proper uniform binding for texture and shader parameters.

## Fix Implementation Plan

### Step 1: Create Vertex Shader
```glsl
attribute vec3 position;
attribute vec2 uv;
varying vec2 v_uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

### Step 2: Replace Material Creation
```javascript
material = new THREE.ShaderMaterial({
    uniforms: {
        u_texture: { value: texture },
        ...uniforms
    },
    vertexShader: vertexShaderCode,
    fragmentShader: fragmentShader || defaultFragmentShader
});
```

### Step 3: Update Uniform Handling
Ensure uniform updates in the `$effect` work with ShaderMaterial structure.

## Testing Strategy

1. **Basic Texture Test**: First test with simple texture display (no effects)
2. **Shader Test**: Apply basic grayscale shader
3. **Advanced Effects**: Test vignette and other shaders
4. **Multiple Videos**: Test with different video formats/resolutions

## Validation Checklist

- [ ] Video displays without shaders (basic texture)
- [ ] Grayscale shader applies correctly
- [ ] Vignette shader applies correctly
- [ ] Shader parameter sliders work
- [ ] Multiple video uploads work
- [ ] Console shows no WebGL errors
- [ ] Performance is acceptable

## Debug Logging
Keep existing `[Tracer]` logging to monitor:
- Frame reception
- Texture updates
- WebGL texture binding
- Shader compilation
- Render loop execution