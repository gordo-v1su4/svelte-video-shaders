# Detailed Development Plan & Checklist

This document provides a granular, technical blueprint for completing the current feature set. We will follow these steps precisely.

## Phase 1: Stabilize Core Functionality (Current Phase)

**Objective:** Achieve stable, error-free playback of a single video with real-time shader controls.

*   [ ] **1.1: Correct the `mp4box.js` Import (The Build Breaker)**
    *   **Problem:** The current `import MP4Box from 'mp4box';` syntax is incorrect for the module format provided by the `mp4box` library, causing the application to fail at build time.
    *   **Technical Action:** Modify the import statement in `src/lib/ShaderPlayer.svelte`. The correct syntax is likely to be a "namespace" import: `import * as MP4Box from 'mp4box';`. I will verify this against the library's documentation and examples.
    *   **Verification:** The `pnpm run dev` command completes successfully, and the application loads in the browser without any import-related errors in the browser or server console.

*   [ ] **1.2: Implement the WebCodecs + `three.js` Frame-by-Frame Pipeline**
    *   **Objective:** Create a high-performance pipeline where `WebCodecs` decodes video frames and `three.js` renders them as textures with GLSL shaders applied.
    *   **Technical Actions (in `ShaderPlayer.svelte`):**
        1.  **Demuxing:** On component mount, fetch the video `src`. Use `mp4box.js` to parse the `.mp4` container. The `onSamples` callback will be used to extract the raw, encoded video chunks.
        2.  **Decoding:** Initialize a `VideoDecoder`. In the `onReady` callback from `mp4box.js`, configure the decoder with the video's specific codec, width, and height.
        3.  **Frame-by-Frame Rendering:**
            *   The `onSamples` callback from `mp4box.js` will feed the encoded chunks directly into the `videoDecoder.decode()` method.
            *   The `VideoDecoder`'s `output` callback will receive the raw, decoded `VideoFrame` object.
            *   Inside this `output` callback, we will update the `three.js` texture by setting `texture.image = frame` and `texture.needsUpdate = true`. This is the critical step that applies the new frame to our shader.
            *   Crucially, we must call `frame.close()` after using the frame to release its memory and prevent performance degradation.
        4.  **Render Loop:** The `three.js` render loop (`requestAnimationFrame`) will be responsible *only* for rendering the scene (`renderer.render(scene, camera)`). It will *not* be involved in the decoding logic.
    *   **Verification:**
        *   When a video is loaded, the browser console will show logs from `mp4box.js` indicating the video is being processed.
        *   The video will play smoothly in the player view.
        *   There will be no "texture upload" performance bottlenecks, as the `VideoFrame` can often be used directly by the GPU (a zero-copy operation).

*   [ ] **1.3: Verify Shader and UI Control Functionality**
    *   **Objective:** Ensure the UI controls are correctly manipulating the shader uniforms in real-time.
    *   **Technical Actions:**
        1.  The `uniforms` object will be passed as a prop from `+page.svelte` to `ShaderPlayer.svelte`.
        2.  A Svelte `$effect` in `ShaderPlayer.svelte` will watch for changes in the `uniforms` prop.
        3.  When a change is detected, the effect will update the `three.js` material's uniforms directly (e.g., `mesh.material.uniforms.u_strength.value = uniforms.u_strength.value`).
    *   **Verification:**
        *   Selecting the "Grayscale" shader and moving the "Strength" slider will update the video in real-time.
        *   Selecting the "Vignette" shader and using the "Vignette Color" and "Vignette Center" controls will update the video in real-time.
