# Swappy Video Player: WebCodecs, WebGL2, and Three.js Integration

To implement the recommended approach for your Swappy project, we’ll transition the `VideoPlayer.svelte` component to use **WebCodecs API** with **WebGL2** for playback and real-time **Three.js** texture overlays, leveraging audio-reactive data from `AudioTimeline.svelte`. We’ll also use WebCodecs for lightweight processing tasks like thumbnail generation, retaining **FFmpeg WASM** for complex tasks (e.g., video exports). This will streamline video upload, playback, and filter application, improving performance and robustness. Below are detailed instructions tailored to your project, including error handling, Web Workers for FFmpeg, and browser compatibility testing.

---

### Overview of Changes
1. **Playback**:
   - Replace the dual `<video>` element system in `VideoPlayer.svelte` with a WebGL2 canvas using Three.js for rendering.
   - Use WebCodecs (`VideoDecoder`) to decode video frames, feeding them to Three.js as textures for audio-reactive filters.
   - Sync audio data from `AudioTimeline.svelte`’s Web Audio API to drive shader effects.

2. **Processing**:
   - Implement WebCodecs for thumbnail generation to replace FFmpeg WASM where possible.
   - Move FFmpeg WASM to a Web Worker to prevent UI blocking.
   - Retain FFmpeg for complex tasks (e.g., video conversion, export).

3. **Robustness**:
   - Add fallback to HTML5 `<video>` if WebCodecs is unsupported.
   - Implement error handling for WebCodecs and Three.js.
   - Ensure compatibility with Chrome, Safari, and Edge, maintaining COEP/COOP headers for SharedArrayBuffer.

4. **Dependencies**:
   - Add `three` for Three.js (`npm install three`).
   - Add `mp4box` for MP4 container parsing (`npm install mp4box`).
   - Update `ffmpegService.js` to run in a Web Worker.

---

### Step-by-Step Implementation

#### 1. Install Dependencies
Run the following to add required libraries:

```bash
pnpm install three mp4box
```

Update `package.json`:
```json
{
  "dependencies": {
    "@ffmpeg/ffmpeg": "^0.12.15",
    "@ffmpeg/util": "^0.12.2",
    "wavesurfer.js": "^7.9.5",
    "three": "^0.169.0",
    "mp4box": "^0.5.2"
  }
}
```

#### 2. Update `ffmpegService.js` to Use Web Worker
To prevent UI blocking, move FFmpeg operations to a Web Worker. Create a new file `src/ffmpegWorker.js` and update `ffmpegService.js`.

**`src/ffmpegWorker.js`**:
```javascript
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

self.onmessage = async ({ data }) => {
  const ffmpeg = new FFmpeg();
  let loaded = false;

  const load = async () => {
    if (loaded) return;
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL('https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/umd/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL('https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.15/dist/umd/ffmpeg-core.wasm', 'application/wasm'),
      });
      loaded = true;
      self.postMessage({ type: 'loaded' });
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  };

  const generateThumbnail = async (videoData, timeSeconds, uniqueId) => {
    try {
      await load();
      const inputFileName = `input-${uniqueId}.mp4`;
      const outputFileName = `thumbnail-${uniqueId}.jpg`;
      await ffmpeg.writeFile(inputFileName, videoData);
      await ffmpeg.exec([
        '-i', inputFileName,
        '-ss', timeSeconds.toString(),
        '-vframes', '1',
        '-vf', 'scale=320:-1',
        '-q:v', '2',
        '-y',
        outputFileName
      ]);
      const data = await ffmpeg.readFile(outputFileName);
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);
      self.postMessage({ type: 'thumbnail', uniqueId, data: data.buffer }, [data.buffer]);
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  };

  switch (data.type) {
    case 'generateThumbnail':
      await generateThumbnail(data.videoData, data.timeSeconds, data.uniqueId);
      break;
    default:
      self.postMessage({ type: 'error', error: 'Unknown command' });
  }
};
```

**Update `src/ffmpegService.js`**:
```javascript
class FFmpegService {
  constructor() {
    this.worker = null;
    this.loaded = false;
    this.callbacks = new Map();
  }

  async load() {
    if (this.loaded) return;
    if (this.worker) return; // Worker already initializing

    this.worker = new Worker('/src/ffmpegWorker.js', { type: 'module' });
    this.worker.onmessage = ({ data }) => {
      if (data.type === 'loaded') {
        this.loaded = true;
        console.log('✅ FFmpeg Worker loaded');
      } else if (data.type === 'thumbnail') {
        const callback = this.callbacks.get(data.uniqueId);
        if (callback) {
          const blob = new Blob([data.data], { type: 'image/jpeg' });
          callback(URL.createObjectURL(blob));
          this.callbacks.delete(data.uniqueId);
        }
      } else if (data.type === 'error') {
        console.error('❌ FFmpeg Worker error:', data.error);
      }
    };

    // Wait for worker to load
    await new Promise((resolve) => {
      const checkLoaded = () => {
        if (this.loaded) resolve();
        else setTimeout(checkLoaded, 100);
      };
      checkLoaded();
    });
  }

  async generateThumbnail(videoFile, timeSeconds = 1) {
    await this.load();
    const uniqueId = `thumb-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const videoData = await fetchFile(videoFile);
    return new Promise((resolve, reject) => {
      this.callbacks.set(uniqueId, resolve);
      this.worker.postMessage({ type: 'generateThumbnail', videoData, timeSeconds, uniqueId }, [videoData.buffer]);
      setTimeout(() => {
        if (this.callbacks.has(uniqueId)) {
          this.callbacks.delete(uniqueId);
          reject(new Error('Thumbnail generation timeout'));
        }
      }, 10000);
    });
  }

  setLogCallback(callback) {
    // Implement if needed
  }
}

const ffmpegService = new FFmpegService();
export default ffmpegService;
```

#### 3. Update `VideoPlayer.svelte` for WebCodecs + WebGL2 + Three.js
Replace the dual `<video>` system with a WebGL2 canvas using Three.js, decoding frames with WebCodecs and MP4Box.js for MP4 parsing. Add audio-reactive filters using data from `AudioTimeline.svelte`.

**`src/VideoPlayer.svelte`**:
```svelte
<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import * as THREE from 'three';
  import MP4Box from 'mp4box';
  import { getContext } from 'svelte';

  let {
    currentVideo = null,
    playing = false,
    savedPositions = {},
    playbackRate = 1.0
  } = $props();
  const dispatch = createEventDispatcher();

  let canvas = $state();
  let videoDecoder = $state();
  let renderer = $state();
  let scene = $state();
  let camera = $state();
  let material = $state();
  let texture = $state();
  let animationFrame = $state();
  let currentVideoId = $state(null);
  let isPlaying = $state(false);
  let lastFrameTime = $state(0);
  let mp4boxfile = $state();
  let useFallback = $state(false); // Fallback to HTML5 video if WebCodecs unsupported

  // Get audio frequency data from AudioTimeline context
  const { getFrequencyData } = getContext('audioData') || {};
  let frequencyData = $state(new Uint8Array(256));

  // Fallback video element
  let fallbackVideo = $state();

  onMount(() => {
    // Check WebCodecs support
    if (!window.VideoDecoder || !window.MP4Box) {
      console.warn('⚠️ WebCodecs or MP4Box not supported, using fallback <video>');
      useFallback = true;
      return;
    }

    // Initialize Three.js
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    texture = new THREE.Texture();
    material = new THREE.ShaderMaterial({
      uniforms: {
        tVideo: { value: texture },
        uFrequency: { value: frequencyData },
        uTime: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tVideo;
        uniform float uFrequency[256];
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(tVideo, vUv);
          float bass = 0.0;
          for (int i = 0; i < 16; i++) {
            bass += uFrequency[i];
          }
          bass /= 16.0;
          color.rgb += vec3(bass * 0.3 * sin(uTime));
          gl_FragColor = color;
        }
      `
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    // Resize canvas
    resizeCanvas();

    // Start rendering loop
    render();

    // Add resize listener
    window.addEventListener('resize', resizeCanvas);

    // Initialize audio data updates
    $effect(() => {
      if (getFrequencyData) {
        frequencyData = getFrequencyData();
        material.uniforms.uFrequency.value = frequencyData;
      }
    });
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (videoDecoder) videoDecoder.close();
    if (renderer) renderer.dispose();
    window.removeEventListener('resize', resizeCanvas);
    if (fallbackVideo) {
      fallbackVideo.pause();
      fallbackVideo.src = '';
    }
  });

  function resizeCanvas() {
    if (!canvas || !renderer) return;
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    renderer.setSize(width, height);
    canvas.width = width;
    canvas.height = height;
  }

  function render() {
    if (!renderer || !material) return;
    material.uniforms.uTime.value = performance.now() / 1000;
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(render);
  }

  async function handleVideoChange(video) {
    if (!video || !video.url) return;

    if (useFallback) {
      if (fallbackVideo) {
        fallbackVideo.src = video.url;
        fallbackVideo.currentTime = savedPositions[video.id] || 0;
        fallbackVideo.playbackRate = playbackRate;
        if (playing) fallbackVideo.play();
        currentVideoId = video.id;
      }
      return;
    }

    try {
      // Close existing decoder
      if (videoDecoder) {
        videoDecoder.close();
        videoDecoder = null;
      }

      // Initialize MP4Box
      mp4boxfile = MP4Box.createFile();
      mp4boxfile.onReady = async (info) => {
        const videoTrack = info.tracks.find((t) => t.type === 'video');
        if (!videoTrack) {
          console.error('❌ No video track found');
          return;
        }

        videoDecoder = new VideoDecoder({
          output: (frame) => {
            texture.image = frame;
            texture.needsUpdate = true;
            frame.close();
          },
          error: (e) => {
            console.error('❌ Decoder error:', e);
            dispatch('videoerror', { error: e.message, video });
          }
        });

        videoDecoder.configure({
          codec: videoTrack.codec,
          codedWidth: videoTrack.track_width,
          codedHeight: videoTrack.track_height
        });

        mp4boxfile.setExtractionOptions(videoTrack.id);
        mp4boxfile.start();

        mp4boxfile.onSamples = (trackId, ref, samples) => {
          for (const sample of samples) {
            if (!isPlaying && playing) continue;
            const chunk = new EncodedVideoChunk({
              type: sample.is_sync ? 'key' : 'delta',
              timestamp: sample.cts * 1000,
              duration: sample.duration * 1000,
              data: sample.data
            });
            videoDecoder.decode(chunk);
          }
        };
      };

      // Load video file
      const arrayBuffer = await fetch(video.url).then((res) => res.arrayBuffer());
      arrayBuffer.fileStart = 0;
      mp4boxfile.appendBuffer(arrayBuffer);
      mp4boxfile.flush();

      // Restore saved position
      if (savedPositions[video.id] !== undefined) {
        lastFrameTime = savedPositions[video.id] * 1000;
      } else {
        lastFrameTime = 0;
      }

      currentVideoId = video.id;
    } catch (error) {
      console.error('❌ Video change error:', error);
      dispatch('videoerror', { error: error.message, video });
      useFallback = true; // Fallback to <video> on error
    }
  }

  $effect(() => {
    if (currentVideo && currentVideo.id !== currentVideoId) {
      handleVideoChange(currentVideo);
    }
  });

  $effect(() => {
    if (useFallback && fallbackVideo) {
      if (playing && !isPlaying) {
        fallbackVideo.play();
        isPlaying = true;
      } else if (!playing && isPlaying) {
        fallbackVideo.pause();
        isPlaying = false;
        dispatch('saveposition', {
          id: currentVideoId,
          position: fallbackVideo.currentTime
        });
      }
    } else if (videoDecoder) {
      isPlaying = playing;
    }
  });

  $effect(() => {
    if (useFallback && fallbackVideo) {
      fallbackVideo.playbackRate = playbackRate;
    }
  });

  export function setPlaybackRate(rate) {
    if (useFallback && fallbackVideo) {
      fallbackVideo.playbackRate = rate;
    }
    // WebCodecs playback rate handled via frame timing
  }

  export function getCurrentTime() {
    if (useFallback && fallbackVideo) return fallbackVideo.currentTime;
    return lastFrameTime / 1000;
  }
</script>

<div class="video-player">
  {#if useFallback}
    <video
      bind:this={fallbackVideo}
      src={currentVideo?.url}
      class="fallback-video"
      muted
      loop
      preload="auto"
      crossorigin="anonymous"
    ></video>
  {:else}
    <canvas bind:this={canvas} class="webgl-canvas"></canvas>
  {/if}
</div>

<style>
  .video-player {
    width: 100%;
    height: 100%;
    background-color: #121212;
    border-radius: 4px;
    overflow: hidden;
    position: relative;
  }
  .webgl-canvas, .fallback-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
</style>
```

#### 4. Update `VideoEditor.svelte` for Thumbnail Generation with WebCodecs
Modify the thumbnail generation to use WebCodecs instead of FFmpeg where possible, with FFmpeg as a fallback.

**`src/VideoEditor.svelte`** (replace `generateSimpleThumbnail`):
```svelte
<script>
  // ... existing imports ...
  import MP4Box from 'mp4box';

  async function generateThumbnail(video) {
    if (!window.VideoDecoder) {
      console.warn('⚠️ WebCodecs not supported, falling back to FFmpeg');
      return generateThumbnailInBackground(video); // Use existing FFmpeg method
    }

    try {
      console.log(`🖼️ Generating thumbnail for: ${video.name}`);
      videos = videos.map(v => v.id === video.id ? { ...v, processing: true } : v);

      const mp4boxfile = MP4Box.createFile();
      let thumbnailUrl = null;

      mp4boxfile.onReady = async (info) => {
        const videoTrack = info.tracks.find((t) => t.type === 'video');
        if (!videoTrack) throw new Error('No video track found');

        const decoder = new VideoDecoder({
          output: (frame) => {
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = (frame.codedHeight / frame.codedWidth) * 320;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              thumbnailUrl = URL.createObjectURL(blob);
              videos = videos.map(v =>
                v.id === video.id ? { ...v, thumbnailUrl, processing: false } : v
              );
              frame.close();
            }, 'image/jpeg', 0.8);
          },
          error: (e) => console.error('Decoder error:', e)
        });

        decoder.configure({
          codec: videoTrack.codec,
          codedWidth: videoTrack.track_width,
          codedHeight: videoTrack.track_height
        });

        mp4boxfile.setExtractionOptions(videoTrack.id);
        mp4boxfile.start();

        mp4boxfile.onSamples = (trackId, ref, samples) => {
          const sample = samples.find(s => s.cts >= 1000); // Seek to ~1s
          if (sample) {
            const chunk = new EncodedVideoChunk({
              type: sample.is_sync ? 'key' : 'delta',
              timestamp: sample.cts * 1000,
              duration: sample.duration * 1000,
              data: sample.data
            });
            decoder.decode(chunk);
            mp4boxfile.stop();
            decoder.close();
          }
        };
      };

      const arrayBuffer = await fetch(video.url).then(res => res.arrayBuffer());
      arrayBuffer.fileStart = 0;
      mp4boxfile.appendBuffer(arrayBuffer);
      mp4boxfile.flush();

      // Wait for thumbnail
      await new Promise(resolve => setTimeout(resolve, 1000));
      return thumbnailUrl;
    } catch (error) {
      console.error(`❌ Thumbnail generation failed for ${video.name}:`, error);
      videos = videos.map(v => v.id === video.id ? { ...v, processing: false } : v);
      return generateThumbnailInBackground(video); // Fallback to FFmpeg
    }
  }
</script>
```

#### 5. Update `AudioTimeline.svelte` to Provide Audio Data

Ensure `AudioTimeline.svelte` exposes audio frequency data via context, as done in your provided code (no changes needed if already set up).

#### 6. Add Tweakpane for Filter Controls
Integrate `svelte-tweakpane-ui` for real-time filter parameter tweaking.

```bash
pnpm install svelte-tweakpane-ui
```

**Update `VideoPlayer.svelte`** (add Tweakpane controls):
```svelte
<script>
  import { Tweakpane } from 'svelte-tweakpane-ui';

  let filterParams = $state({
    intensity: 0.3,
    frequencyScale: 1.0
  });

  // Update shader uniforms
  $effect(() => {
    if (material) {
      material.uniforms.uIntensity = { value: filterParams.intensity };
      material.uniforms.uFrequencyScale = { value: filterParams.frequencyScale };
    }
  });
</script>

<Tweakpane title="Filter Controls">
  <Tweakpane.Input bind:value={filterParams.intensity} label="Intensity" min={0} max={1} step={0.01} />
  <Tweakpane.Input bind:value={filterParams.frequencyScale} label="Frequency Scale" min={0} max={2} step={0.01} />
</Tweakpane>
```

#### 7. Browser Compatibility and Testing
- **Headers**: Ensure `vite.config.js` retains COEP/COOP headers for SharedArrayBuffer:
  ```javascript
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
  ```
- **Testing**:
  - Test in **Chrome 94+**, **Edge 94+**, **Safari 16.4+** to verify WebCodecs and WebGL2.
  - Check fallback `<video>` behavior in browsers without WebCodecs (e.g., older Safari).
  - Verify FFmpeg Worker performance for thumbnails/exports.
  - Use browser dev tools to monitor memory usage and GPU performance.

#### 8. Performance Optimizations
- **Preload Frames**: Buffer a few frames with WebCodecs to reduce decoding latency.
- **Three.js**: Minimize draw calls; use a single plane geometry for the video texture.
- **Web Worker**: Ensure FFmpeg tasks (e.g., exports) run in the worker to keep UI responsive.
- **Memory Management**: Close `VideoDecoder` and dispose Three.js resources on component destroy.

---

### Summary
This implementation:
- Replaces HTML5 `<video>` with WebCodecs + WebGL2 + Three.js for playback and real-time effects.
- Uses MP4Box.js to parse MP4 files for WebCodecs.
- Moves FFmpeg to a Web Worker for non-blocking processing.
- Adds Tweakpane for filter controls.
- Includes a fallback to `<video>` for unsupported browsers.
- Maintains audio synchronization via `AudioTimeline.svelte`’s Web Audio API.

Test thoroughly, especially the WebCodecs fallback and shader performance. If you need further assistance with specific shader effects or debugging, let me know!