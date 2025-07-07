# Project Log: Svelte Video Shaders

This document tracks the development process, key decisions, and important learnings for the Svelte Video Shaders project.

## Initial Setup (Day 1)

*   Bootstrapped a new SvelteKit project.
*   Established a basic project structure.
*   Added `svelte-tweakpane-ui` for the control panel.

## Core Architecture Journey

The path to a stable video rendering architecture was challenging. We explored several approaches before landing on the current, robust solution.

### Attempt 1: `ffmpeg.wasm` (Abandoned)

*   **Goal:** Use `ffmpeg.wasm` and the WebCodecs API for precise, frame-by-frame video processing.
*   **Challenges:**
    *   Complex build configuration required for cross-origin isolation.
    *   Significant performance overhead and memory issues, leading to browser crashes.
    *   Difficult to debug and prone to silent failures.
*   **Outcome:** This approach was abandoned as it was too complex and unreliable for this use case.

### Attempt 2: `@sveltejs/gl` (Abandoned)

*   **Goal:** Use the experimental, Svelte-native `@sveltejs/gl` library for a more declarative approach.
*   **Challenges:**
    *   The library is highly experimental and not production-ready.
    *   Caused numerous build issues and Vite dependency conflicts (`.glsl` loaders, SSR incompatibility).
*   **Outcome:** Abandoned due to instability and lack of maturity.

### Attempt 3: `Threlte` (Abandoned)

*   **Goal:** Use `Threlte`, a popular and well-supported Svelte wrapper for `three.js`.
*   **Challenges:**
    *   While a significant improvement, we still encountered subtle reactivity and lifecycle issues that were difficult to debug within the abstraction layer.
*   **Outcome:** We decided to move to a "bare metal" `three.js` implementation to gain more direct control and simplify debugging.

### Attempt 4: "Bare Metal" `three.js` (Current & Stable)

*   **Goal:** Use the standard `three.js` library directly for maximum control and stability.
*   **Outcome:** This is the current, working architecture. The journey to stabilize it revealed several key learnings.

## Key Learnings & Technical Decisions

This project has reinforced several core principles of modern web development, especially when combining complex libraries.

1.  **Browser Autoplay Policies are Strict:** Videos with audio will almost never autoplay. The most robust solution is to require a user interaction (like a click) to initiate playback. Our "Click to Play" overlay is the definitive solution to this.

2.  **`OrthographicCamera` is Correct for 2D Work:** When rendering a 2D plane in a 3D scene, a `PerspectiveCamera` introduces unnecessary complexity and sizing issues. An `OrthographicCamera` provides a direct, 1-to-1 mapping of units to pixels, which is much easier to reason about and control.

3.  **Definitive Sizing and Layout Logic:** The following is the **correct and final** way to size and position the video plane within its container. This should not be changed.
    *   The `three.js` canvas is set to `width: 100%` and `height: 100%` of its parent container.
    *   The `handleResize` function in `ShaderPlayer.svelte` is the single source of truth for sizing.
    *   It sets the `OrthographicCamera`'s frustum to match the canvas's pixel dimensions.
    *   It then scales the `PlaneGeometry` mesh to fit within that frustum while maintaining the video's original aspect ratio.
    *   A `scaleFactor` of `0.5` is applied to render the video at half the size of the container.

4.  **Svelte 5 Reactivity:**
    *   State that needs to trigger re-renders of the component's structure (e.g., showing/hiding the canvas with `{#if}`) must be declared with `$state`.
    *   Props are passed down reactively, but child components must be designed to handle potentially `undefined` values on their initial render. Providing a minimal, valid default for the `fragmentShader` was the key to preventing crashes.

---

*This log was last updated on Day 1 of the project.*