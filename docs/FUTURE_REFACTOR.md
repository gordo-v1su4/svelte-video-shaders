# Future Refactor: Simplification & Performance

**Status**: Planned (not started)
**Priority**: Do after core features are stable
**Context**: The clip switching race condition and speed ramping bugs are now fixed. Before adding more features, simplify the architecture so future work doesn't keep hitting the same structural problems.

## Why Now (Soon) Rather Than Later

The two hardest bugs we hit -- glitchy clip switching and broken speed ramping -- were both caused by the same root issue: too much logic tangled together in one place (`VideoWorkbench.svelte` at 3400+ lines), with timing-sensitive code spread across reactive effects instead of being co-located. The longer we wait, the harder this refactor gets.

## 1. Shader Registry (Biggest Win)

### Problem
Adding a new shader currently requires editing 4-5 places in `VideoWorkbench.svelte`:
1. Import statement (line ~9-33)
2. Switch case in `fragmentShader` derived (line ~518-545)
3. Uniforms added to flat shared object (line ~364-515)
4. Tweakpane controls (scattered throughout ~1700+ lines)
5. Dropdown options list

This is error-prone and is why some shaders didn't work initially -- missed wiring.

### Solution
Each shader file becomes fully self-describing:

```javascript
// src/lib/shaders/bloom-shader.js
export default {
    name: 'Bloom',
    fragmentShader: `...GLSL...`,
    uniforms: {
        u_intensity_bloom: { value: 1.0, min: 0, max: 5, step: 0.1, label: 'Intensity' },
        u_luminanceThreshold: { value: 0.9, min: 0, max: 1, step: 0.01, label: 'Threshold' },
    },
};
```

A registry module auto-imports all shaders from the folder:

```javascript
// src/lib/shaders/index.js
const modules = import.meta.glob('./*-shader.js', { eager: true });
export const shaderRegistry = Object.values(modules).map(m => m.default);
```

Then `VideoWorkbench.svelte` needs zero changes when adding a shader. Tweakpane controls generate automatically from the uniform metadata (min/max/step/label).

### Effort: Medium (1-2 sessions)

## 2. Split VideoWorkbench.svelte

### Problem
One 3400+ line file handles: video management, audio analysis, speed ramping, beat detection, shader selection, uniform management, Tweakpane UI, waveform display, MIDI import, section management, and playback control.

### Proposed Split

| New Module | Responsibility | Approx Lines |
|-----------|---------------|-------------|
| `VideoWorkbench.svelte` | Layout, Tweakpane shell, component composition | ~400 |
| `PlaybackEngine.svelte.js` | `updateTime()`, `checkBeatTriggers()`, speed ramping, audio master clock | ~300 |
| `ShaderManager.svelte.js` | Shader registry, uniform management, shader selection | ~200 |
| `AudioManager.svelte.js` | Audio loading, Essentia API calls, FFT analysis, beat/onset data | ~300 |
| `TriggerSystem.svelte.js` | Beat triggers, jump cuts, FX spikes, glitch mode, video cycling | ~200 |
| `VideoPool.svelte.js` | Video asset management, section pools, cycling logic | ~200 |

Using Svelte 5's `.svelte.js` modules (reactive classes/functions without a component), these can share `$state` and `$derived` without being full components.

### Effort: Medium-Large (2-3 sessions)

## 3. WebGL2 / GLSL 3.00 Migration (Optional, Future)

### What
Three.js supports `WebGL2Renderer` and `RawShaderMaterial` which allow GLSL 3.00 ES syntax:
- `texture()` instead of `texture2D()`
- `in/out` instead of `varying`
- `out vec4 fragColor` instead of `gl_FragColor`
- Better precision qualifiers
- Integer textures, texture arrays

### Why Consider It
- GLSL 3.00 is the modern standard -- more ShaderToy/online examples use it
- WebGL2 is supported in all modern browsers (Chrome, Firefox, Safari, Edge)
- Opens the door to compute-shader-like features via transform feedback
- Better compatibility when porting shaders from other sources

### Why Wait
- Current shaders all work fine with GLSL ES 1.00
- Migration means rewriting all 25+ shaders
- No functional benefit for the current effects
- Only worth doing alongside the shader registry refactor (convert format once)

### Effort: Small per shader, but 25+ shaders = Medium total

## 4. WebGPU (Future, Experimental)

### What
WebGPU is the successor to WebGL. Three.js has experimental WebGPU support via `WebGPURenderer`.

### Why Consider It
- Compute shaders (real parallel processing, not just fragment shaders)
- Better performance for multi-pass effects
- Modern API design (closer to Vulkan/Metal/DX12)
- Could enable real-time video encoding/export via GPU

### Why Wait
- Three.js WebGPU support is still experimental
- Browser support: Chrome stable, Firefox nightly only, Safari partial
- Would require rewriting shaders in WGSL (WebGPU Shading Language) -- completely different syntax from GLSL
- No practical benefit for current use case (single-pass fragment shaders on video)

### When to Revisit
When Three.js WebGPU is stable AND you need multi-pass effects or GPU compute (e.g., real-time video encoding, particle systems, physics).

### Effort: Large (full rewrite of shader pipeline)

## Recommended Order

1. **Shader Registry** -- Biggest quality-of-life win, lowest risk. Do this first.
2. **Split VideoWorkbench** -- Makes everything else easier. Do second.
3. **GLSL 3.00 migration** -- Only if porting lots of external shaders. Optional.
4. **WebGPU** -- Wait for ecosystem maturity. Revisit in 6-12 months.

## What's Already Solid (Don't Touch)

These parts are working well and don't need refactoring:

- **WebCodecs + mp4box pipeline** -- Fast, hardware-accelerated, correct
- **ImageBitmap frame buffer** -- Instant random access, GPU-resident
- **Three.js ShaderMaterial rendering** -- Right abstraction level for video effects
- **`updateTime()` single-loop architecture** -- Atomic beat detection + frame calculation (just fixed)
- **Audio FFT -> shader uniforms** -- Clean, real-time, performant
- **Essentia API integration** -- Offline analysis works well
- **WaveformDisplay component** -- Already well-encapsulated

## Notes

- The GLSL ES 1.00 format documented in `SHADER_FORMAT_GUIDE.md` remains correct for the current stack
- The clip switching fix documented in `CLIP_SWITCH_RACE_CONDITION_FIX.md` should be preserved through any refactor
- The `checkBeatTriggers()` imperative pattern should carry forward into the `TriggerSystem` module
