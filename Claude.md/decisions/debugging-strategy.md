# Debugging Strategy & Technical Decisions

## Problem Analysis Methodology

### 1. **Systematic Pipeline Verification**
**Decision**: Verify each stage of the video pipeline independently
**Rationale**: Complex pipelines fail at specific points - isolate the failure

**Applied Method**:
1. ✅ File upload functionality
2. ✅ MP4Box parsing and track extraction  
3. ✅ WebCodecs configuration and decoding
4. ✅ Frame reception and texture updates
5. ❌ **Shader material rendering** ← Found failure point

### 2. **Code Analysis vs Runtime Analysis**
**Decision**: Prioritize code analysis over runtime debugging for this issue
**Rationale**: Console logs showed successful frame processing - issue likely architectural

**Evidence**:
- Console logs: "Frame received, updating texture directly"
- Console logs: "Successfully uploaded VideoFrame to WebGL texture"  
- No WebGL errors in console
- Render loop executing normally

**Conclusion**: Issue is in material/shader setup, not runtime processing

### 3. **Three.js Material Architecture Understanding**
**Decision**: Deep-dive into Three.js material types and shader capabilities
**Rationale**: Suspected shader-related issue based on successful texture updates

**Key Finding**:
```javascript
// MeshBasicMaterial: Fixed pipeline, no custom shaders
material = new THREE.MeshBasicMaterial({ map: texture });

// ShaderMaterial: Programmable pipeline, custom shaders
material = new THREE.ShaderMaterial({
    uniforms: { u_texture: { value: texture } },
    vertexShader: customVertexShader,
    fragmentShader: customFragmentShader
});
```

**Root Cause**: Lines 576-582 attempt to set `material.fragmentShader` on MeshBasicMaterial, which has no effect.

## Technical Decision Tree

### Why ShaderMaterial over Other Options?

#### Option 1: Fix MeshBasicMaterial Usage
❌ **Rejected**: MeshBasicMaterial doesn't support custom fragment shaders by design

#### Option 2: Use RawShaderMaterial  
❌ **Rejected**: Requires manual matrix transformations and attribute handling

#### Option 3: Use ShaderMaterial
✅ **Selected**: 
- Supports custom vertex + fragment shaders
- Automatic matrix and attribute handling
- Compatible with existing Three.js setup
- Integrates well with uniform system

### Vertex Shader Requirements

**Decision**: Use standard vertex shader with UV mapping
**Rationale**: Fragment shaders need texture coordinates (v_uv) for sampling

```glsl
varying vec2 v_uv;
void main() {
    v_uv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

### Uniform Management Strategy

**Decision**: Merge texture uniform with custom uniforms
**Rationale**: Consistent uniform handling for both texture and shader parameters

```javascript
const allUniforms = {
    u_texture: { value: texture },
    ...uniforms  // Spread shader-specific uniforms
};
```

## Debugging Tools & Techniques Used

### 1. **Console Log Analysis**
**Technique**: Follow `[Tracer]` logs through entire pipeline
**Value**: Confirmed successful processing until rendering stage

### 2. **Code Structure Analysis** 
**Technique**: Map component responsibilities and data flow
**Value**: Identified ShaderPlayer as central rendering component

### 3. **Three.js Documentation Review**
**Technique**: Verify material capabilities and shader requirements
**Value**: Confirmed MeshBasicMaterial limitations

### 4. **WebCodecs Reference Implementation**
**Reference**: https://github.com/w3c/webcodecs/tree/main/samples/video-decode-display
**Value**: Validated our WebGL texture upload approach

## Risk Assessment & Mitigation

### Implementation Risk: Shader Compilation Errors
**Risk**: Custom shaders may have syntax errors
**Mitigation**: 
- Start with simple pass-through shader
- Add error handling for shader compilation
- Provide fallback to basic texture rendering

### Performance Risk: Shader Complexity
**Risk**: Complex fragment shaders may impact performance
**Mitigation**:
- Profile shader performance
- Optimize shader code for mobile GPUs
- Consider simplified shader versions

### Compatibility Risk: WebGL Support
**Risk**: Older devices may not support required WebGL features
**Mitigation**:
- Test on target device range
- Provide graceful degradation
- Consider canvas 2D fallback

## Implementation Validation Plan

### Phase 1: Basic Functionality
1. Replace MeshBasicMaterial with ShaderMaterial
2. Add simple pass-through fragment shader
3. Verify video texture displays correctly

### Phase 2: Shader Integration
1. Apply existing grayscale shader
2. Test uniform parameter updates
3. Verify Tweakpane controls work

### Phase 3: Full Feature Test
1. Test all shader variations
2. Verify multiple video uploads
3. Test shader switching
4. Performance validation

## Learning Documentation

### Key Insights for Future Reference
1. **Three.js Material Types**: Understanding when to use each material type
2. **WebCodecs Integration**: Direct VideoFrame to WebGL texture upload patterns
3. **Svelte Reactivity**: Effect timing with Three.js object lifecycle
4. **Shader Development**: Vertex + fragment shader requirements for video processing

This debugging strategy successfully identified the root cause in ~2 hours of analysis versus potentially days of trial-and-error runtime debugging.