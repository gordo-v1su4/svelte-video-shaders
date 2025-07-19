# Video Shaders Development Plan

## Project Overview
Video Shaders is a Svelte-based web application that enables real-time video processing and shader effects using WebCodecs API for hardware-accelerated video decoding and WebGL/Three.js for rendering.

## Architecture
- **Frontend**: Svelte 5 with runes
- **Video Processing**: WebCodecs API for H.264 video decoding
- **MP4 Parsing**: MP4Box.js for extracting AVC configuration
- **Rendering**: Three.js + WebGL for shader effects
- **UI Controls**: Tweakpane UI for interactive controls
- **Utilities**: Mediabunny library for video processing helpers

## Current Development Notes
- User reports that clicking the 'upload video' button in the Tweakframe UI does nothing.
- Issue occurs on the user's local environment.
- No files or components named 'tweakframe' or 'upload' found in the codebase; upload functionality may be implemented under a different name or location.
- No references to 'tweakframe' found via text search; investigating dev and examples directories for possible UI implementations.
- User reports two instances of the Tweakframe UI are present; should be unified into one.
- The main Video Shaders app structure exists outside mediabunny; Tweakframe UI likely implemented in the main app's src folder.
- Located Tweakframe UI and upload logic in main app's `src/routes/+page.svelte` and `src/lib/VideoControls.svelte`.
- Upload functionality is handled by a hidden file input and an `onFileSelected` handler.
- Upload button logic in VideoControls.svelte has been updated to ensure file input is properly bound and accessible when clicked.
- Only one instance of VideoControls is rendered in the main page; duplicate UI may be a browser/dev server issue.
- Duplicate upload buttons/UI persist even after code review; no evidence of multiple renders in code—must investigate Svelte HMR, dev server, or browser cache issues.
- User clarified that the issue is multiple draggable Tweakpane panes instead of a unified pane; warning about duplicate `localStoreId` for draggable panes.
- Fix in progress: Remove Pane wrapper from VideoControls and combine video/shader controls in a single parent Pane in +page.svelte.
- Controls are now unified in a single draggable Tweakpane pane.
- Upload button is actually working; video file is uploaded and processed, but errors occur in video processing pipeline (thumbnail generation and WebCodecs pipeline).
- Errors observed: TypeError in generateThumbnail (videoTrack must be InputVideoTrack) and DataError in WebCodecs VideoDecoder (missing key frame/config).
- User requested to add https://kitschpatrol.com/svelte-tweakpane-ui/docs to the docs.
- Official svelte-tweakpane-ui documentation link added to tweakpane-ui-interop.md in project docs.
- Tweakpane UI's upload button (inside the pane) does NOT actually upload a video; upload functionality is still broken for the user.
- Svelte-tweakpane-ui Button requires `on:click` syntax (not `onclick`) for event binding in Svelte 5/runes; cross-check and update code to use the correct event binding syntax for compatibility.
- Tweakpane upload button now opens file dialog and triggers file selection event, but video does not load due to error in WebCodecs pipeline (DataError: missing key frame/config). Thumbnail generation is now working (CanvasSink fix applied).
- AVC configuration (description) is missing from videoTrack; must debug MP4Box extraction for H.264 streams.
- Implemented targeted extraction of AVC configuration for WebCodecs using mp4boxfile.getTrackById and fallbacks; currently verifying if this resolves the decode failure.
- Latest attempt to extract AVC config with getTrackById did NOT resolve WebCodecs decode failure; no AVC config found in track info or fallbacks. Further MP4Box.js AVC extraction debugging required.
- Successfully located avcC in sample description table, but value is not an ArrayBuffer (TypeError: Failed to read the 'description' property from 'VideoDecoderConfig'). Need to convert or extract raw bytes for WebCodecs.
- ReferenceError encountered: DataStream is not defined when attempting to serialize avcC for WebCodecs. Need to ensure DataStream is available or use alternative serialization method.
- Successfully extracted avcC as ArrayBuffer and configured WebCodecs VideoDecoder; video decoding is now working. New issue: WebGL error 'can't texture a closed VideoFrame' (frames may be released too early).
- WebGL VideoFrame lifecycle fix successful; no more 'can't texture a closed VideoFrame' error. New issue: 'GL_INVALID_VALUE: glCopySubTextureCHROMIUM: Offset overflows texture dimensions'—indicates a WebGL texture size/dimension mismatch.
- User provided reference to WebCodecs + WebGL sample implementation for correct usage: https://github.com/w3c/webcodecs/tree/main/samples/video-decode-display (suggests using gl.texImage2D with VideoFrame for upload).
- User clarified: video should render at a standard 16:9 aspect ratio, but with a manageable resolution such as 720p (1280x720), not just any 16:9 size. WebGL texture and rendering pipeline should use this resolution for display.
- Requirement: WebGL/canvas/video output must always be 1280x720 (16:9), regardless of input video resolution.
- New issue: Three.js creates immutable textures (gl.texStorage2D), causing 'Texture is immutable' error when updating with gl.texImage2D. Need to create/update texture in a mutable way or use a custom WebGL texture for direct VideoFrame upload.
- Inefficiency: handleResize is being called on every frame, which is unnecessary and should be optimized.
- Use gl.texSubImage2D instead of gl.texImage2D to update immutable textures created via gl.texStorage2D (Three.js default).
- Renderer/canvas size should match actual video frame dimensions (e.g. 1264x720) to avoid mismatches with texture upload and WebGL errors.
- Remaining issue: Three.js texture may be created before video dimensions are known, causing dimension mismatch and GL_INVALID_VALUE errors. Need to ensure texture is (re)created with correct video dimensions as soon as they're available.
- Texture recreation with correct video dimensions is now implemented and no WebGL errors remain.
- New issue: Black screen—frames are received and texture is updated, but video is not visible. Need to debug why the video is not displaying after successful frame and texture handling.
- User requested: Make the task plan/checklist file accessible from the project root, and update the README to reflect any changes to the overall project framework.

## Task List
- [x] Confirm the expected behavior of the upload button in Tweakframe UI.
- [x] Check for errors in the browser console when clicking 'upload video'.
- [x] Inspect the upload button element and its event handlers in the codebase.
- [x] Verify that all necessary dependencies for file uploads are installed and up to date.
- [x] Test video upload functionality after potential fixes.
- [x] Debug and fix video processing pipeline errors after upload (thumbnail generation, WebCodecs decode failure).
  - [x] Fix thumbnail generation pipeline bug (use CanvasSink)
  - [x] Debug/fix WebCodecs decode failure (missing key frame/config: extract AVC config from MP4Box videoTrack using getTrackById and fallbacks, verify playback; further MP4Box.js AVC extraction debugging required)
    - [x] Convert avcC object from sample description to ArrayBuffer for WebCodecs description field
      - [x] Import or polyfill DataStream, or use alternative method to serialize avcC to ArrayBuffer
- [x] Add svelte-tweakpane-ui documentation link to project docs.
- [ ] Investigate and resolve duplicate Tweakframe UI instances.
  - [x] Check for accidental multiple renders in layout or parent components.
  - [ ] Investigate Svelte HMR/dev server issues causing duplicate rendering.
  - [ ] Review for unintended remounts or state issues.
  - [x] Unify multiple draggable Tweakpane panes into a single pane and set unique `localStoreId` for each if needed.
- [x] Fix Tweakpane Button upload: update to use `on:click` event syntax for Svelte 5/runes compatibility.
- [x] Ensure Three.js texture is created or re-created with correct video dimensions before uploading VideoFrame data to WebGL texture.
- [ ] Debug why video is not visible after successful texture and frame updates (black screen issue).
- [x] Copy or symlink the task plan/checklist file to the project root for easy access.
- [ ] Refactor the project README to reflect recent changes to the framework, features, and workflow.

## Current Goal
Debug black screen after successful video frame upload.

## Technical Implementation Details

### Video Processing Pipeline
1. **File Upload**: Tweakpane UI button opens file dialog
2. **MP4 Parsing**: MP4Box.js extracts video track and AVC configuration
3. **WebCodecs Setup**: VideoDecoder configured with extracted AVC config
4. **Frame Decoding**: Hardware-accelerated H.264 decoding to VideoFrames
5. **WebGL Upload**: Direct VideoFrame-to-texture upload using `gl.texSubImage2D`
6. **Shader Rendering**: Three.js renders video with custom shaders

### Key Components
- `src/lib/ShaderPlayer.svelte`: Main video rendering component
- `src/lib/VideoControls.svelte`: Tweakpane UI controls
- `src/routes/+page.svelte`: Main application page
- `mediabunny/`: Video processing utilities library

### WebGL Texture Handling
- Textures are recreated with correct video dimensions on first frame
- Uses `gl.texSubImage2D` for updating immutable Three.js textures
- Renderer matches actual video dimensions to avoid WebGL errors

### Dependencies
- Svelte 5 with runes
- Three.js for WebGL rendering
- MP4Box.js for MP4 parsing
- Tweakpane UI for controls
- WebCodecs API (browser native)
