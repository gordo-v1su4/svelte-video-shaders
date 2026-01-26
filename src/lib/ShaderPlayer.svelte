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

	// Output dimensions (match frame buffer - 1280x720 max, 16:9 aspect)
	let OUTPUT_WIDTH = 1280;
	let OUTPUT_HEIGHT = 720;
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
	let isExternallyControlled = false; // When true, render loop skips frame advancement (setAudioTime controls it)
	
	// Clip-based playback (for video cycling)
	let currentClipIndex = 0;
	let clipLocalFrame = 0; // Frame within current clip
	let clipStartAudioTime = 0; // Real audio time when this clip started (for marker detection)
	let clipStartRampedTime = 0; // Remapped time when this clip started (for speed ramping)
	let clipLoopCount = 0;
	let hasSignaledClipEnd = false;
	let jumpFrameOffset = 0; // Accumulated jump cut offset (applied to frame calculation)

	// Audio-reactive state
	let beatIndex = 0;
	let playbackStartTime = 0;

	// Clip switch is now instant (no queue needed for pre-decoded frames)

	// VideoFrame-backed texture (WebCodecs, GPU-resident for maximum performance)

	// Default shaders
	const vertexShader = `
		varying vec2 v_uv;
		void main() {
			// Flip V coordinate (works for both VideoFrame and ImageBitmap)
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

		// Initialize Three.js with DPR clamping to avoid GPU memory spikes
		// (especially important on high-DPI displays and mobile)
		const maxDPR = Math.min(window.devicePixelRatio || 1, 2);
		
		renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
		renderer.setPixelRatio(maxDPR);
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

		// Create texture once (image set to VideoFrame per render - GPU-resident)
		texture = new THREE.Texture();
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.wrapS = THREE.ClampToEdgeWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.format = THREE.RGBAFormat;
		texture.generateMipmaps = false;
		// VideoFrames use standard texture coordinates (flipY = false)
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

		// Get frame and render - this is the hot path, keep it simple
		if (frameBuffer && frameBuffer.totalFrames > 0) {
			
			// Advance frames if playing and NOT externally controlled
			if (isPlaying && !isExternallyControlled) {
				accumulatedTime += deltaTime * playbackSpeed;
				const framesToAdvance = Math.floor(accumulatedTime / FRAME_DURATION_MS);
				if (framesToAdvance > 0) {
					globalFrameIndex += framesToAdvance;
					accumulatedTime -= framesToAdvance * FRAME_DURATION_MS;
				}
			}

			// Handle looping/clamping
			if (enableLooping) {
				globalFrameIndex = ((globalFrameIndex % frameBuffer.totalFrames) + frameBuffer.totalFrames) % frameBuffer.totalFrames;
			} else {
				globalFrameIndex = Math.max(0, Math.min(frameBuffer.totalFrames - 1, globalFrameIndex));
			}

			// Get frame directly from pre-decoded buffer (instant - no async)
			const frame = frameBuffer.getFrame(globalFrameIndex);
			if (frame) {
				// Direct texture update - all frames are same size (1280x720)
				texture.image = frame;
				texture.needsUpdate = true;
				isReady = true;
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
		// Direct seek - instant for pre-decoded frames
		globalFrameIndex = frameIndex;
		accumulatedTime = 0;
	}

	/**
	 * Switch to a different clip - INSTANT for pre-decoded frames
	 * No queuing, no delays - just set the state directly
	 */
	export function seekToClip(clipIndex, audioTime = null, rampedTime = null) {
		if (!frameBuffer) return;
		
		const clipInfo = frameBuffer.getClipInfo(clipIndex);
		if (!clipInfo) return;
		
		// Instant state update - no async, no queuing
		currentClipIndex = clipIndex;
		clipLocalFrame = 0;
		clipLoopCount = 0;
		hasSignaledClipEnd = false;
		globalFrameIndex = clipInfo.startFrame;
		accumulatedTime = 0;
		jumpFrameOffset = 0;
		
		// Set timing for audio sync
		if (audioTime !== null && audioTime !== undefined) {
			clipStartAudioTime = audioTime;
			clipStartRampedTime = (rampedTime !== null && rampedTime !== undefined) 
				? rampedTime 
				: audioTime;
		}
	}

	export function setSpeed(speed) {
		playbackSpeed = speed;
		// When using setSpeed (not setAudioTime), we're in internal control mode
		isExternallyControlled = false;
	}

	export function jumpFrames(delta) {
		// If externally controlled (audio master mode), accumulate jump offset
		// Otherwise, directly modify globalFrameIndex
		if (isExternallyControlled) {
			// Accumulate jump offset - will be applied in setAudioTime()
			jumpFrameOffset += delta;
		} else {
			// Direct mode - modify globalFrameIndex and clamp to clip boundaries
			if (frameBuffer) {
				const clipInfo = frameBuffer.getClipInfo(currentClipIndex);
				if (clipInfo) {
					// Calculate new local frame within clip
					const newLocalFrame = clipLocalFrame + delta;
					// Clamp to clip boundaries (will loop if enableLooping is true)
					if (enableLooping) {
						clipLocalFrame = ((newLocalFrame % clipInfo.frameCount) + clipInfo.frameCount) % clipInfo.frameCount;
					} else {
						clipLocalFrame = Math.max(0, Math.min(clipInfo.frameCount - 1, newLocalFrame));
					}
					globalFrameIndex = clipInfo.startFrame + clipLocalFrame;
				} else {
					// Fallback: modify global index directly
					globalFrameIndex += delta;
					if (frameBuffer.totalFrames > 0) {
						if (enableLooping) {
							globalFrameIndex = ((globalFrameIndex % frameBuffer.totalFrames) + frameBuffer.totalFrames) % frameBuffer.totalFrames;
						} else {
							globalFrameIndex = Math.max(0, Math.min(frameBuffer.totalFrames - 1, globalFrameIndex));
						}
					}
				}
			} else {
				globalFrameIndex += delta;
			}
		}
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
	 * FAST PATH: Just calculates frame index, no async operations
	 * @param {number} audioTimeSeconds - Current audio time in seconds
	 * @param {number} fps - Video frame rate (default 24)
	 * @returns {number} The frame index that was set
	 */
	export function setAudioTime(audioTimeSeconds, fps = 24) {
		if (!frameBuffer || frameBuffer.totalFrames === 0) return 0;
		
		isExternallyControlled = true;
		
		const clipInfo = frameBuffer.getClipInfo(currentClipIndex);
		if (!clipInfo) {
			// Fallback: simple global frame calculation
			globalFrameIndex = Math.floor(audioTimeSeconds * fps) % frameBuffer.totalFrames;
			return globalFrameIndex;
		}
		
		// Calculate time elapsed since this clip started
		const elapsedTime = Math.max(0, audioTimeSeconds - clipStartRampedTime);
		const clipDurationSeconds = clipInfo.frameCount / fps;
		
		// Calculate frame within clip (with looping)
		let targetFrame = Math.floor(elapsedTime * fps);
		
		// Apply jump cut offset if any
		if (jumpFrameOffset !== 0) {
			targetFrame += jumpFrameOffset;
			jumpFrameOffset = 0;
		}
		
		// Wrap frame within clip bounds
		clipLocalFrame = ((targetFrame % clipInfo.frameCount) + clipInfo.frameCount) % clipInfo.frameCount;
		
		// Convert to global frame index
		globalFrameIndex = clipInfo.startFrame + clipLocalFrame;
		
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











