<script>
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let {
		frameBuffer = null,
		fragmentShader,
		uniforms = $bindable({}),
		filtersEnabled = true,
		analysisData = { beats: [], bpm: 0 },
		enableLooping = true,
		onClipComplete = null
	} = $props();

	// Output dimensions (will match frame buffer)
	let OUTPUT_WIDTH = 1920;
	let OUTPUT_HEIGHT = 1080;
	const TARGET_FPS = 24;
	const FRAME_DURATION_MS = 1000 / TARGET_FPS;

	// Internal state
	let canvas;
	let isPlaying = $state(false);
	let isReady = $state(false);

	// Three.js state
	let renderer, scene, camera, material, mesh;
	let texture = null;
	let animationFrameId;

	// Playback state - this is the heart of retiming
	let globalFrameIndex = 0;
	let playbackSpeed = 1.0;
	let lastRenderTime = 0;
	let accumulatedTime = 0;
	
	// Clip-based playback (for video cycling)
	let currentClipIndex = 0;
	let clipLocalFrame = 0; // Frame within current clip
	let clipStartAudioTime = 0; // Audio time when this clip started
	let clipLoopCount = 0;
	let hasSignaledClipEnd = false;

	// Audio-reactive state
	let beatIndex = 0;
	let playbackStartTime = 0;

	// VideoFrame-backed texture (WebCodecs, GPU-only)

	// Default shaders
	const vertexShader = `
		varying vec2 v_uv;
		void main() {
			// Flip V coordinate for ImageBitmap (opposite of VideoFrame)
			v_uv = vec2(uv.x, 1.0 - uv.y);
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`;
	const defaultFragmentShader = `
		varying vec2 v_uv;
		uniform sampler2D u_texture;
		void main() {
			gl_FragColor = texture2D(u_texture, v_uv);
		}
	`;

	onMount(() => {
		if (!canvas) return;

		// Initialize Three.js
		renderer = new THREE.WebGLRenderer({ canvas });
		scene = new THREE.Scene();
		camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
		camera.position.z = 1;

		// Initialize material with uniforms
		const materialUniforms = { u_texture: { value: null } };
		if (uniforms) {
			for (const key in uniforms) {
				// Handle vec2/vec3 arrays properly for Three.js
				if (Array.isArray(uniforms[key].value)) {
					if (uniforms[key].value.length === 2) {
						materialUniforms[key] = { value: new THREE.Vector2(uniforms[key].value[0], uniforms[key].value[1]) };
					} else if (uniforms[key].value.length === 3) {
						materialUniforms[key] = { value: new THREE.Vector3(uniforms[key].value[0], uniforms[key].value[1], uniforms[key].value[2]) };
					} else {
						materialUniforms[key] = { value: uniforms[key].value };
					}
				} else {
					materialUniforms[key] = { value: uniforms[key].value };
				}
			}
		}

		material = new THREE.ShaderMaterial({
			uniforms: materialUniforms,
			vertexShader,
			fragmentShader: filtersEnabled ? (fragmentShader || defaultFragmentShader) : defaultFragmentShader
		});

		const geometry = new THREE.PlaneGeometry(2, 2);
		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		// Setup fixed size
		renderer.setSize(854, 480, false);
		mesh.scale.set(1, 1, 1);

		// Create texture once (image set to ImageBitmap per render)
		texture = new THREE.Texture();
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.wrapS = THREE.ClampToEdgeWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.format = THREE.RGBAFormat;
		texture.generateMipmaps = false;
		// ImageBitmap coordinate system - UV flip handled in shader
		texture.flipY = false;
		material.uniforms.u_texture.value = texture;

		// Start render loop
		render();

		return () => {
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
			if (renderer) renderer.dispose();
			if (texture) texture.dispose();
		};
	});

	function render() {
		animationFrameId = requestAnimationFrame(render);
		const currentTime = performance.now();
		const deltaTime = currentTime - lastRenderTime;
		lastRenderTime = currentTime;

		// Update time uniform
		if (material?.uniforms?.u_time) {
			material.uniforms.u_time.value = currentTime * 0.001;
		}

		// Only advance frames if playing and buffer is ready
		if (isPlaying && frameBuffer && frameBuffer.totalFrames > 0) {


			// Accumulate time and advance frames
			accumulatedTime += deltaTime * playbackSpeed;
			const framesToAdvance = Math.floor(accumulatedTime / FRAME_DURATION_MS);
			if (framesToAdvance > 0) {
				globalFrameIndex += framesToAdvance;
				accumulatedTime -= framesToAdvance * FRAME_DURATION_MS;
			}

			// Handle looping or stopping at end
			if (frameBuffer.totalFrames > 0) {
				if (enableLooping) {
					// Wrap globalFrameIndex for seamless looping
					// Use modulo for positive wrapping (seamless loop)
					globalFrameIndex = globalFrameIndex % frameBuffer.totalFrames;
					// Handle negative indices (for reverse playback or glitch effects)
					if (globalFrameIndex < 0) {
						globalFrameIndex = globalFrameIndex + frameBuffer.totalFrames;
					}
				} else {
					// No looping - clamp to valid range and stop at end
					if (globalFrameIndex >= frameBuffer.totalFrames) {
						globalFrameIndex = frameBuffer.totalFrames - 1;
						// Stop playback when reaching the end
						if (isPlaying) {
							isPlaying = false;
						}
					} else if (globalFrameIndex < 0) {
						globalFrameIndex = 0;
					}
				}
			}
			
			// Update output dimensions from frame buffer if changed
			if (frameBuffer.outputWidth && frameBuffer.outputHeight) {
				if (OUTPUT_WIDTH !== frameBuffer.outputWidth || OUTPUT_HEIGHT !== frameBuffer.outputHeight) {
					OUTPUT_WIDTH = frameBuffer.outputWidth;
					OUTPUT_HEIGHT = frameBuffer.outputHeight;
					// Update resolution uniform directly on material (don't trigger bindable update)
					if (material?.uniforms?.u_resolution) {
						if (material.uniforms.u_resolution.value instanceof THREE.Vector2) {
							material.uniforms.u_resolution.value.set(OUTPUT_WIDTH, OUTPUT_HEIGHT);
						} else {
							material.uniforms.u_resolution.value = [OUTPUT_WIDTH, OUTPUT_HEIGHT];
						}
					}
				}
			}
			
			frameBuffer.primeAroundFrame(globalFrameIndex);

			// Get current frame from buffer (VideoFrame from WebCodecs)
			const videoFrame = frameBuffer.getFrame(globalFrameIndex);
			if (videoFrame) {
				texture.image = videoFrame;
				texture.needsUpdate = true;
				isReady = true;
			}
		} else if (frameBuffer && frameBuffer.totalFrames > 0) {
			// Not playing - still show the current frame (paused state)
			// Update output dimensions from frame buffer if changed
			if (frameBuffer.outputWidth && frameBuffer.outputHeight) {
				if (OUTPUT_WIDTH !== frameBuffer.outputWidth || OUTPUT_HEIGHT !== frameBuffer.outputHeight) {
					OUTPUT_WIDTH = frameBuffer.outputWidth;
					OUTPUT_HEIGHT = frameBuffer.outputHeight;
					// Update resolution uniform directly on material (don't trigger bindable update)
					if (material?.uniforms?.u_resolution) {
						if (material.uniforms.u_resolution.value instanceof THREE.Vector2) {
							material.uniforms.u_resolution.value.set(OUTPUT_WIDTH, OUTPUT_HEIGHT);
						} else {
							material.uniforms.u_resolution.value = [OUTPUT_WIDTH, OUTPUT_HEIGHT];
						}
					}
				}
			}
			
			frameBuffer.primeAroundFrame(globalFrameIndex);
			const videoFrame = frameBuffer.getFrame(globalFrameIndex);
			if (videoFrame) {
				texture.image = videoFrame;
				texture.needsUpdate = true;
				if (!isReady) {
					console.log('[ShaderPlayer] Paused render: Frame ready!', globalFrameIndex);
					isReady = true;
				}
			} else {
				// Throttle debug logs
				if (Math.random() < 0.01) console.log('[ShaderPlayer] Paused render: Waiting for frame', globalFrameIndex);
			}
		}

		renderer?.render(scene, camera);
	}

	// === External Control API ===
	
	export function play() {
		if (!frameBuffer || frameBuffer.totalFrames === 0) return;
		isPlaying = true;
		lastRenderTime = performance.now();
		playbackStartTime = performance.now();
		beatIndex = 0;
		accumulatedTime = 0;
	}

	export function pause() {
		isPlaying = false;
	}

	export function stop() {
		isPlaying = false;
		globalFrameIndex = 0;
		accumulatedTime = 0;
		beatIndex = 0;
		isReady = false;
	}

	export function seek(frameIndex) {
		globalFrameIndex = frameIndex;
		accumulatedTime = 0;
		frameBuffer?.primeAroundFrame(globalFrameIndex);
	}

	export function seekToClip(clipIndex, audioTime = null) {
		if (!frameBuffer) return;
		const clipInfo = frameBuffer.getClipInfo(clipIndex);
		if (clipInfo) {
			currentClipIndex = clipIndex;
			clipLocalFrame = 0;
			clipLoopCount = 0;
			hasSignaledClipEnd = false;
			globalFrameIndex = clipInfo.startFrame;
			accumulatedTime = 0;
			frameBuffer.primeAroundFrame(globalFrameIndex);
			// Record when this clip started (for relative frame calculation)
			if (audioTime !== null) {
				clipStartAudioTime = audioTime;
			}
			console.log(`[ShaderPlayer] seekToClip(${clipIndex}): startFrame=${clipInfo.startFrame}, frameCount=${clipInfo.frameCount}, audioTime=${audioTime?.toFixed(2)}`);
		}
	}

	export function setSpeed(speed) {
		playbackSpeed = speed;
	}

	export function jumpFrames(delta) {
		globalFrameIndex += delta;
	}

	export function getCurrentFrame() {
		return globalFrameIndex;
	}

	export function getTotalFrames() {
		return frameBuffer?.totalFrames || 0;
	}

	export function getIsPlaying() {
		return isPlaying;
	}

	/**
	 * Set the video frame based on audio time (audio-as-master-clock)
	 * Now respects current clip - uses time relative to when clip started
	 * @param {number} audioTimeSeconds - Current audio time in seconds
	 * @param {number} fps - Video frame rate (default 24)
	 * @returns {number} The frame index that was set
	 */
	export function setAudioTime(audioTimeSeconds, fps = 24) {
		if (!frameBuffer || frameBuffer.totalFrames === 0) return 0;
		
		// Get current clip info
		const clipInfo = frameBuffer.getClipInfo(currentClipIndex);
		if (!clipInfo) {
			// Fallback: use all frames
			const targetFrame = Math.floor(audioTimeSeconds * fps);
			globalFrameIndex = targetFrame % frameBuffer.totalFrames;
			frameBuffer.primeAroundFrame(globalFrameIndex);
			return globalFrameIndex;
		}
		
		// Calculate time elapsed since this clip started
		const elapsedTime = Math.max(0, audioTimeSeconds - clipStartAudioTime);
		const clipDurationSeconds = clipInfo.frameCount / fps;
		const maxClipFrame = clipInfo.frameCount - 1;
		if (elapsedTime < clipDurationSeconds) {
			clipLoopCount = 0;
			hasSignaledClipEnd = false;
		}

		if (!enableLooping && elapsedTime >= clipDurationSeconds) {
			clipLocalFrame = Math.max(0, maxClipFrame);
			globalFrameIndex = clipInfo.startFrame + clipLocalFrame;
			accumulatedTime = 0;

			if (!hasSignaledClipEnd) {
				hasSignaledClipEnd = true;
				isPlaying = false;
				if (typeof onClipComplete === 'function') {
					onClipComplete({
						clipIndex: currentClipIndex,
						elapsedTime,
						loopCount: clipLoopCount
					});
				}
			}

			return globalFrameIndex;
		}

		// Calculate frame within current clip based on elapsed time (loop within clip)
		const targetFrame = Math.floor(elapsedTime * fps);
		clipLocalFrame = ((targetFrame % clipInfo.frameCount) + clipInfo.frameCount) % clipInfo.frameCount;

		if (enableLooping && clipDurationSeconds > 0) {
			const nextLoopCount = Math.floor(elapsedTime / clipDurationSeconds);
			if (nextLoopCount > clipLoopCount) {
				clipLoopCount = nextLoopCount;
				if (typeof onClipComplete === 'function') {
					onClipComplete({
						clipIndex: currentClipIndex,
						elapsedTime,
						loopCount: clipLoopCount
					});
				}
			}
		}
		
		// Convert to global frame index
		globalFrameIndex = clipInfo.startFrame + clipLocalFrame;
		frameBuffer.primeAroundFrame(globalFrameIndex);
		
		// Reset accumulated time since we're externally controlled
		accumulatedTime = 0;
		
		return globalFrameIndex;
	}

	/**
	 * Get the current video time in seconds (based on frame index and fps)
	 * @param {number} fps - Video frame rate (default 24)
	 * @returns {number} Current time in seconds
	 */
	export function getVideoTime(fps = 24) {
		return globalFrameIndex / fps;
	}

	// === Reactive Updates ===

	// Track last uniform values to prevent infinite loops
	let lastUniformValues = new Map();
	
	$effect(() => {
		if (!material?.uniforms || !uniforms) return;
		
		// Only update if uniforms object reference changed or values actually changed
		for (const key in uniforms) {
			const newValue = uniforms[key]?.value;
			const lastValue = lastUniformValues.get(key);
			
			// Skip if value hasn't changed (prevent infinite loop)
			if (lastValue === newValue) continue;
			
			// For arrays, do deep comparison
			if (Array.isArray(newValue) && Array.isArray(lastValue)) {
				if (newValue.length === lastValue.length && 
				    newValue.every((v, i) => v === lastValue[i])) {
					continue;
				}
			}
			
			lastUniformValues.set(key, Array.isArray(newValue) ? [...newValue] : newValue);
			
			if (material.uniforms[key]) {
				// Update existing uniform
				if (Array.isArray(newValue)) {
					if (newValue.length === 2 && material.uniforms[key].value instanceof THREE.Vector2) {
						material.uniforms[key].value.set(newValue[0], newValue[1]);
					} else if (newValue.length === 3 && material.uniforms[key].value instanceof THREE.Vector3) {
						material.uniforms[key].value.set(newValue[0], newValue[1], newValue[2]);
					} else {
						material.uniforms[key].value = newValue;
					}
				} else {
					material.uniforms[key].value = newValue;
				}
			} else {
				// Create new uniform with proper type
				if (Array.isArray(newValue)) {
					if (newValue.length === 2) {
						material.uniforms[key] = { value: new THREE.Vector2(newValue[0], newValue[1]) };
					} else if (newValue.length === 3) {
						material.uniforms[key] = { value: new THREE.Vector3(newValue[0], newValue[1], newValue[2]) };
					} else {
						material.uniforms[key] = { value: newValue };
					}
				} else {
					material.uniforms[key] = { value: newValue };
				}
			}
		}
	});

	$effect(() => {
		if (material && uniforms && fragmentShader) {
			// Ensure all uniforms exist before updating shader
			// This prevents shader compilation errors from missing uniforms
			for (const key in uniforms) {
				if (!material.uniforms[key]) {
					// Handle vec2/vec3 arrays properly
					if (Array.isArray(uniforms[key].value)) {
						if (uniforms[key].value.length === 2) {
							material.uniforms[key] = { value: new THREE.Vector2(uniforms[key].value[0], uniforms[key].value[1]) };
						} else if (uniforms[key].value.length === 3) {
							material.uniforms[key] = { value: new THREE.Vector3(uniforms[key].value[0], uniforms[key].value[1], uniforms[key].value[2]) };
						} else {
							material.uniforms[key] = { value: uniforms[key].value };
						}
					} else {
						material.uniforms[key] = { value: uniforms[key].value };
					}
				}
			}
			
			// Update fragment shader
			const newFragmentShader = filtersEnabled ? (fragmentShader || defaultFragmentShader) : defaultFragmentShader;
			
			// Only update if shader actually changed
			if (material.fragmentShader !== newFragmentShader) {
				try {
					material.fragmentShader = newFragmentShader;
					material.needsUpdate = true;
					
					console.log('[ShaderPlayer] Shader updated, length:', newFragmentShader.length);
				} catch (error) {
					console.error('[ShaderPlayer] Error updating shader:', error);
					console.error('[ShaderPlayer] Shader preview:', newFragmentShader.substring(0, 200));
					
					// Fallback to default shader on error - don't stop video playback
					console.warn('[ShaderPlayer] Falling back to default shader to prevent video stop');
					material.fragmentShader = defaultFragmentShader;
					material.needsUpdate = true;
				}
			}
		}
	});

	// Reset when frameBuffer changes
	$effect(() => {
		if (frameBuffer && frameBuffer.totalFrames > 0) {
			globalFrameIndex = 0;
			accumulatedTime = 0;
			beatIndex = 0;
			isReady = false;
			frameBuffer.primeAroundFrame(0);
		}
	});
</script>

<div class="player-container">
	<canvas bind:this={canvas}></canvas>
	{#if !frameBuffer || frameBuffer.totalFrames === 0}
		<div class="overlay">
			<span>Upload videos to begin</span>
		</div>
	{/if}
</div>

<style>
	.player-container {
		width: 854px;
		height: 480px;
		position: relative;
		background-color: #000;
	}

	canvas {
		display: block;
		width: 854px;
		height: 480px;
	}

	.overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(0, 0, 0, 0.8);
		display: flex;
		justify-content: center;
		align-items: center;
		color: #666;
		font-size: 1.2rem;
	}
</style>











