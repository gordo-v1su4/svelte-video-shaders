<script>
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let {
		frameBuffer = null,
		fragmentShader,
		uniforms = {},
		filtersEnabled = true,
		audioReactivePlayback = false,
		analysisData = { beats: [], bpm: 0 }
	} = $props();

	// Fixed output dimensions
	const OUTPUT_WIDTH = 1920;
	const OUTPUT_HEIGHT = 1080;
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

	// Audio-reactive state
	let beatIndex = 0;
	let playbackStartTime = 0;

	// Reusable canvas for texture updates
	let textureCanvas = null;
	let textureContext = null;

	// Default shaders
	const vertexShader = `
		varying vec2 v_uv;
		void main() {
			v_uv = uv;
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
				materialUniforms[key] = { value: uniforms[key].value };
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

		// Create texture canvas once
		textureCanvas = document.createElement('canvas');
		textureCanvas.width = OUTPUT_WIDTH;
		textureCanvas.height = OUTPUT_HEIGHT;
		textureContext = textureCanvas.getContext('2d', { willReadFrequently: true });

		// Create texture once
		texture = new THREE.Texture(textureCanvas);
		texture.minFilter = THREE.LinearFilter;
		texture.magFilter = THREE.LinearFilter;
		texture.wrapS = THREE.ClampToEdgeWrapping;
		texture.wrapT = THREE.ClampToEdgeWrapping;
		texture.format = THREE.RGBAFormat;
		texture.generateMipmaps = false;
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
			// Audio-reactive playback modifications
			if (audioReactivePlayback && uniforms) {
				const audioLevel = uniforms.u_audioLevel?.value || 0;
				const trebleLevel = uniforms.u_trebleLevel?.value || 0;
				const bassLevel = uniforms.u_bassLevel?.value || 0;

				// Beat-synced jumps using Essentia data
				if (analysisData?.beats?.length > 0) {
					const audioTimeSeconds = (currentTime - playbackStartTime) / 1000;
					
					while (beatIndex < analysisData.beats.length &&
						   analysisData.beats[beatIndex] < audioTimeSeconds) {
						// Jump cut on beat - skip forward 2-4 frames
						globalFrameIndex += Math.floor(2 + bassLevel * 3);
						beatIndex++;
					}
				}

				// Speed ramp based on audio intensity (0.5x to 3x)
				playbackSpeed = 0.5 + (audioLevel * 2.5);

				// Stutter/glitch on high treble
				if (trebleLevel > 0.6 && Math.random() < 0.1) {
					globalFrameIndex -= Math.floor(Math.random() * 3);
				}
			} else {
				playbackSpeed = 1.0;
			}

			// Accumulate time and advance frames
			accumulatedTime += deltaTime * playbackSpeed;
			const framesToAdvance = Math.floor(accumulatedTime / FRAME_DURATION_MS);
			if (framesToAdvance > 0) {
				globalFrameIndex += framesToAdvance;
				accumulatedTime -= framesToAdvance * FRAME_DURATION_MS;
			}

			// Get current frame from buffer
			const bitmap = frameBuffer.getFrame(globalFrameIndex);
			if (bitmap) {
				textureContext.drawImage(bitmap, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
				texture.needsUpdate = true;
			}
		} else if (frameBuffer && frameBuffer.totalFrames > 0 && !isReady) {
			// Not playing but buffer ready - show first frame
			const bitmap = frameBuffer.getFrame(0);
			if (bitmap) {
				textureContext.drawImage(bitmap, 0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
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
		globalFrameIndex = frameIndex;
		accumulatedTime = 0;
	}

	export function seekToClip(clipIndex) {
		if (!frameBuffer) return;
		const clipInfo = frameBuffer.getClipInfo(clipIndex);
		if (clipInfo) {
			globalFrameIndex = clipInfo.startFrame;
			accumulatedTime = 0;
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

	// === Reactive Updates ===

	$effect(() => {
		if (material?.uniforms) {
			for (const key in uniforms) {
				if (material.uniforms[key]) {
					material.uniforms[key].value = uniforms[key].value;
				} else {
					material.uniforms[key] = { value: uniforms[key].value };
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
					material.uniforms[key] = { value: uniforms[key].value };
				}
			}
			
			// Update fragment shader
			const newFragmentShader = filtersEnabled ? (fragmentShader || defaultFragmentShader) : defaultFragmentShader;
			
			// Only update if shader actually changed
			if (material.fragmentShader !== newFragmentShader) {
				try {
					material.fragmentShader = newFragmentShader;
					material.needsUpdate = true;
					
					// Force program recompilation
					if (material.program) {
						material.program.needsUpdate = true;
					}
					
					console.log('[ShaderPlayer] Shader updated, length:', newFragmentShader.length);
				} catch (error) {
					console.error('[ShaderPlayer] Error updating shader:', error);
					// Fallback to default shader on error
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













