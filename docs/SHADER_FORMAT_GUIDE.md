# Shader Format Guide

This documents the exact format required for GLSL fragment shaders to work with the effect dropdown in `VideoWorkbench.svelte`. Based on trial and error getting 25+ shaders working correctly.

## Why Some Shaders Work and Some Don't

The most common failure modes we encountered:

1. **Wrong GLSL version** -- Must use **WebGL 1.0 / GLSL ES 1.00** syntax. Three.js `ShaderMaterial` compiles against WebGL 1.0 by default.
2. **`texture()` instead of `texture2D()`** -- GLSL ES 1.00 uses `texture2D()`. The `texture()` function is GLSL 3.00+ and will silently fail to compile.
3. **Missing `varying vec2 v_uv`** -- The vertex shader outputs `v_uv` (with a Y-flip). If the fragment shader doesn't declare it, compilation fails.
4. **Undeclared uniforms** -- If the GLSL code declares a `uniform` that isn't in the JavaScript uniforms object, Three.js will error on compilation. Conversely, if the JS object has a uniform the GLSL doesn't declare, it's silently ignored (safe).
5. **Array uniforms not converted to THREE.Vector2/Vector3** -- JavaScript arrays like `[0.002, 0.002]` must be converted to `THREE.Vector2` before passing to the material. `ShaderPlayer.svelte` handles this automatically, but only for arrays of length 2 or 3.
6. **`gl_FragColor` not set** -- Must output to `gl_FragColor` (not `out vec4 fragColor` which is GLSL 3.00+).

## Required Format

### File Structure

Each shader lives in `src/lib/shaders/[name]-shader.js` and exports exactly two things:

```javascript
// src/lib/shaders/example-shader.js

export const exampleFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    // ... your custom uniforms ...

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        // ... your effect ...
        gl_FragColor = color;
    }
`;

export const exampleUniforms = {
    u_time: { value: 0.0 },
    // ... your custom uniform defaults ...
};
```

### GLSL Requirements

| Requirement | Correct | Wrong |
|-------------|---------|-------|
| GLSL version | ES 1.00 (implicit, no `#version` line) | `#version 300 es` |
| UV coordinates | `varying vec2 v_uv;` | `in vec2 v_uv;` |
| Texture sampling | `texture2D(u_texture, v_uv)` | `texture(u_texture, v_uv)` |
| Output | `gl_FragColor = vec4(...)` | `out vec4 fragColor;` / `fragColor = ...` |
| Texture uniform | `uniform sampler2D u_texture;` | `uniform sampler2D tDiffuse;` (Three.js post-processing convention, not used here) |

### Vertex Shader (Fixed -- Do Not Modify)

The vertex shader is defined in `ShaderPlayer.svelte` and is shared by all effects:

```glsl
varying vec2 v_uv;
void main() {
    // Flip V coordinate (works for both VideoFrame and ImageBitmap)
    v_uv = vec2(uv.x, 1.0 - uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
```

Note the **Y-flip** on `uv.y`. This is required because ImageBitmap textures from WebCodecs have flipped Y coordinates compared to standard WebGL texture conventions. Your fragment shader receives already-corrected UVs in `v_uv`.

### Available Built-in Uniforms

These are always available to every shader (provided by the system):

```glsl
uniform sampler2D u_texture;     // Video frame (required)
uniform float u_time;            // Elapsed time in seconds
uniform vec2 u_resolution;       // Canvas resolution in pixels

// Audio-reactive (updated every frame from FFT)
uniform float u_audioLevel;      // Overall volume 0-1
uniform float u_bassLevel;       // Bass frequencies 0-1
uniform float u_midLevel;        // Mid frequencies 0-1
uniform float u_trebleLevel;     // Treble frequencies 0-1
```

You don't need to declare these in your uniforms JS object -- they're provided globally. But you **must** declare them in your GLSL code if you use them.

## Uniform Format Rules

In the JavaScript uniforms object:

```javascript
// Scalar float
u_intensity: { value: 0.5 }

// Vec2 (array of 2) -- auto-converted to THREE.Vector2
u_offset: { value: [0.002, 0.002] }

// Vec3 (array of 3) -- auto-converted to THREE.Vector3
u_color: { value: [1.0, 0.5, 0.0] }

// Boolean as float (GLSL has no bool uniforms in ES 1.00)
u_enabled: { value: 0.0 }  // 0.0 = false, 1.0 = true
```

Arrays of length 2 and 3 are automatically converted to `THREE.Vector2` and `THREE.Vector3` by `ShaderPlayer.svelte`. Other lengths are passed as-is.

## How to Add a New Shader

### 1. Create the shader file

```bash
# src/lib/shaders/my-effect-shader.js
```

Export `myEffectFragmentShader` (GLSL string) and `myEffectUniforms` (defaults object).

### 2. Import in VideoWorkbench.svelte

```javascript
import { myEffectFragmentShader, myEffectUniforms } from '$lib/shaders/my-effect-shader.js';
```

### 3. Add to the shader switch

```javascript
case 'MyEffect': shader = myEffectFragmentShader; break;
```

### 4. Add uniforms to the master uniforms object

All shader uniforms are merged into a single flat object in `VideoWorkbench.svelte` (around line 364). Add your custom uniforms there with sensible defaults:

```javascript
let uniforms = $state({
    // ... existing uniforms ...
    
    // MyEffect uniforms
    u_myParam: { value: 0.5 },
});
```

### 5. Add Tweakpane controls (optional)

Add UI sliders/checkboxes in the Tweakpane section of `VideoWorkbench.svelte`, conditionally shown when your shader is selected.

### 6. Add to the dropdown options

Add your shader name to the `shaderNames` array so it appears in the dropdown.

## Naming Conventions

To avoid uniform name collisions across shaders (since all uniforms live in one flat object):

- Generic names like `u_intensity` are shared across shaders (use if behavior is similar)
- For shader-specific uniforms, suffix with the effect name: `u_intensity_bloom`, `u_offset_vignette`
- Prefixed names avoid accidental cross-shader interference

## Shader Compilation & Error Handling

`ShaderPlayer.svelte` handles compilation errors gracefully:

1. When a new shader is selected, all uniforms are synced to the material first
2. The fragment shader string is set on the material
3. `renderer.compile(scene, camera)` is called to force early error detection
4. If compilation fails, the shader falls back to a passthrough (no effect)
5. Errors are logged to the console: `[ShaderPlayer] Shader compilation error:`

If your shader shows a black screen or no effect, check the browser console for WebGL compilation errors.

## Minimal Working Example

The simplest possible shader that works:

```javascript
export const passthroughFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;

    void main() {
        gl_FragColor = texture2D(u_texture, v_uv);
    }
`;

export const passthroughUniforms = {};
```

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Black screen | Shader compilation failed | Check console for WebGL errors |
| No effect visible | Wrong texture name | Use `u_texture`, not `tDiffuse` |
| Upside-down video | Double Y-flip | Don't flip `v_uv.y` -- vertex shader already does it |
| Shader works in ShaderToy but not here | GLSL version mismatch | Replace `texture()` with `texture2D()`, remove `#version`, use `gl_FragColor` |
| Uniform has no effect | Name mismatch | Ensure GLSL name matches JS object key exactly |
| Array uniform errors | Wrong type | Use arrays of exactly 2 or 3 elements for vec2/vec3 |

## Working Shaders (25 total)

All shaders in `src/lib/shaders/` follow this format:

ASCII, Anamorphic Breathe, Bloom, Brightness/Contrast, Chromatic Aberration, Color Average, Color Depth, CRT, Depth, Depth of Field, Dot Screen, Glitch, Grid, Hue/Saturation, Lens Flare, Noise, Pixelation, Scanline, Sepia, Tilt Shift, Tone Mapping, VHS, Vignette, Water, XlsczN

Plus two inline shaders (Grayscale, Vignette legacy) defined directly in `VideoWorkbench.svelte`.

## Related Files

- `src/lib/ShaderPlayer.svelte` -- Shader compilation, uniform handling, render loop
- `src/lib/VideoWorkbench.svelte` -- Shader selection, uniform defaults, Tweakpane controls
- `src/lib/shaders/*.js` -- All shader effect files
