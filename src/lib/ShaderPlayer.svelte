<script>
	import { onMount } from 'svelte';
	import * as THREE from 'three';

	let {
		pool = null,
		fragmentShader,
		uniforms = $bindable({}),
		filtersEnabled = true,
		enableLooping = true,
		forceBlackout = false
	} = $props();

	/** True when `pool` exposes getActiveVideo (VideoSourcePool). */
	function isVideoPool(p) {
		return p && typeof p.getActiveVideo === 'function';
	}

	/** Match ImageBitmap path: vertex shader flips V; don't also flip in VideoTexture upload. */
	function configureVideoTexture(tex) {
		tex.minFilter = THREE.LinearFilter;
		tex.magFilter = THREE.LinearFilter;
		tex.format = THREE.RGBAFormat;
		tex.generateMipmaps = false;
		tex.flipY = false;
		return tex;
	}

	const TARGET_FPS = 24;
	const FRAME_DURATION_MS = 1000 / TARGET_FPS;

	// Internal state
	let canvas;
	let isPlaying = $state(false);

	// Three.js state
	let renderer, scene, camera, material, mesh;
	let texture = null;
	let videoTexture = null;
	let lastVideoEl = null;
	let animationFrameId;

	// Playback state - the heart of retiming
	let globalFrameIndex = 0;
	let playbackSpeed = 1.0;
	let lastRenderTime = 0;
	let accumulatedTime = 0;
	let isExternallyControlled = false; // When true, setAudioTime drives frame advancement

	// Clip-based playback (for video cycling)
	let currentClipIndex = 0;
	let clipLocalFrame = 0;
	let clipStartRampedTime = 0; // Time when this clip started (for elapsed mapping)
	let jumpFrameOffset = 0; // Accumulated jump cut offset
	let useDirectFrameMapping = false; // Speed ramp mode: remapped time -> frame directly
	let frameUpdatedThisCycle = false; // Guards against stale frames during clip swaps

	const vertexShader = `
		varying vec2 v_uv;
		void main() {
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

		renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
		renderer.setPixelRatio(1);
		renderer.setClearColor(0x000000, 1);
		scene = new THREE.Scene();
		camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
		camera.position.z = 1;

		const materialUniforms = { u_texture: { value: null } };
		if (uniforms) {
			for (const key in uniforms) {
				const value = uniforms[key].value;
				if (Array.isArray(value)) {
					if (value.length === 2) {
						materialUniforms[key] = { value: new THREE.Vector2(value[0], value[1]) };
					} else if (value.length === 3) {
						materialUniforms[key] = { value: new THREE.Vector3(value[0], value[1], value[2]) };
					} else {
						materialUniforms[key] = { value };
					}
				} else {
					materialUniforms[key] = { value };
				}
			}
		}

		material = new THREE.ShaderMaterial({
			uniforms: materialUniforms,
			vertexShader,
			fragmentShader: filtersEnabled
				? fragmentShader || defaultFragmentShader
				: defaultFragmentShader
		});

		const geometry = new THREE.PlaneGeometry(2, 2);
		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		const width = pool?.outputWidth || 1280;
		const height = pool?.outputHeight || 720;
		renderer.setSize(width, height, false);

		if (isVideoPool(pool)) {
			videoTexture = configureVideoTexture(new THREE.VideoTexture(document.createElement('video')));
			material.uniforms.u_texture.value = videoTexture;
		} else {
			texture = new THREE.Texture();
			texture.minFilter = THREE.LinearFilter;
			texture.magFilter = THREE.LinearFilter;
			texture.wrapS = THREE.ClampToEdgeWrapping;
			texture.wrapT = THREE.ClampToEdgeWrapping;
			texture.format = THREE.RGBAFormat;
			texture.generateMipmaps = false;
			texture.flipY = false;
			material.uniforms.u_texture.value = texture;
		}

		render();

		return () => {
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
			if (renderer) renderer.dispose();
			if (texture) texture.dispose();
			if (videoTexture) videoTexture.dispose();
		};
	});

	function render() {
		animationFrameId = requestAnimationFrame(render);
		const currentTime = performance.now();
		const deltaTime = currentTime - lastRenderTime;
		lastRenderTime = currentTime;

		if (mesh) {
			mesh.visible = !forceBlackout;
		}

		if (material?.uniforms?.u_time) {
			material.uniforms.u_time.value = currentTime * 0.001;
		}

		if (pool && (isVideoPool(pool) ? pool.entries?.length > 0 : pool.totalFrames > 0)) {
			if (isVideoPool(pool)) {
				const video = pool.getActiveVideo();
				if (video && video !== lastVideoEl) {
					lastVideoEl = video;
					if (videoTexture) videoTexture.dispose();
					videoTexture = configureVideoTexture(new THREE.VideoTexture(video));
					if (material?.uniforms?.u_texture) {
						material.uniforms.u_texture.value = videoTexture;
					}
				}
				if (videoTexture && video?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
					videoTexture.needsUpdate = true;
				}
			} else if (!isExternallyControlled || frameUpdatedThisCycle) {
				const frame = pool.getFrame(globalFrameIndex);
				if (frame && texture) {
					texture.image = frame;
					texture.needsUpdate = true;
				}
				frameUpdatedThisCycle = false;
			}

			// Advance frames if playing and NOT externally controlled (bitmap pool only)
			if (!isVideoPool(pool) && isPlaying && !isExternallyControlled) {
				accumulatedTime += deltaTime * playbackSpeed;
				const framesToAdvance = Math.floor(accumulatedTime / FRAME_DURATION_MS);
				if (framesToAdvance > 0) {
					globalFrameIndex += framesToAdvance;
					accumulatedTime -= framesToAdvance * FRAME_DURATION_MS;
				}
				frameUpdatedThisCycle = true;
			}

			if (!isVideoPool(pool) && !isExternallyControlled) {
				if (enableLooping) {
					globalFrameIndex =
						((globalFrameIndex % pool.totalFrames) + pool.totalFrames) % pool.totalFrames;
				} else {
					globalFrameIndex = Math.max(0, Math.min(pool.totalFrames - 1, globalFrameIndex));
				}
			}
		}

		renderer?.render(scene, camera);
	}

	// === External Control API ===

	export function play() {
		if (!pool) return;
		const ready = isVideoPool(pool) ? pool.entries?.length > 0 : pool.totalFrames > 0;
		if (!ready) return;
		isPlaying = true;
		lastRenderTime = performance.now();
		accumulatedTime = 0;
	}

	export function pause() {
		isPlaying = false;
	}

	export function stop() {
		isPlaying = false;
		globalFrameIndex = 0;
		accumulatedTime = 0;
	}

	export function seek(frameIndex) {
		globalFrameIndex = frameIndex;
		accumulatedTime = 0;
		pool?.primeAroundFrame(frameIndex);
	}

	/**
	 * Switch to a different clip. The pool prewarms the target frame window so
	 * beat-synced swaps have imagery ready.
	 * @param {number} clipIndex
	 * @param {number|null} audioTime - Real audio time (for elapsed mapping)
	 * @param {boolean} speedRampActive - Whether speed ramping drives frame mapping
	 */
	export function seekToClip(clipIndex, audioTime = null, speedRampActive = false) {
		if (!pool) return;

		const clipInfo = pool.getClipInfo(clipIndex);
		if (!clipInfo) return;

		currentClipIndex = clipIndex;
		accumulatedTime = 0;
		jumpFrameOffset = 0;
		useDirectFrameMapping = speedRampActive;
		frameUpdatedThisCycle = true;

		if (audioTime !== null && audioTime !== undefined) {
			clipStartRampedTime = audioTime;
		}

		clipLocalFrame = 0;
		globalFrameIndex = clipInfo.startFrame;

		if (isVideoPool(pool)) {
			pool.setActiveClip(clipIndex);
			lastVideoEl = null;
			pool.seekActive(0, 0);
		} else {
			pool.primeClip(clipIndex, 0);
		}
	}

	export function setSpeed(speed) {
		playbackSpeed = speed;
		isExternallyControlled = false;
	}

	/** Toggle direct (speed ramp) vs elapsed-time frame mapping. */
	export function setDirectFrameMapping(direct) {
		useDirectFrameMapping = direct;
	}

	export function jumpFrames(delta) {
		if (isExternallyControlled) {
			jumpFrameOffset += delta;
		} else if (pool) {
			const clipInfo = pool.getClipInfo(currentClipIndex);
			if (clipInfo) {
				const newLocalFrame = clipLocalFrame + delta;
				if (enableLooping) {
					clipLocalFrame =
						((newLocalFrame % clipInfo.frameCount) + clipInfo.frameCount) % clipInfo.frameCount;
				} else {
					clipLocalFrame = Math.max(0, Math.min(clipInfo.frameCount - 1, newLocalFrame));
				}
				globalFrameIndex = clipInfo.startFrame + clipLocalFrame;
			} else {
				globalFrameIndex += delta;
			}
		} else {
			globalFrameIndex += delta;
		}
	}

	export function getCurrentFrame() {
		return globalFrameIndex;
	}

	export function getTotalFrames() {
		return pool?.totalFrames || 0;
	}

	export function getIsPlaying() {
		return isPlaying;
	}

	/**
	 * Set the video frame from audio time (audio-as-master-clock).
	 * Direct mapping (speed ramp): frame = floor(remappedTime * fps) % clipFrames.
	 * Elapsed mapping (normal): frame = floor((time - clipStart) * fps) % clipFrames.
	 * @param {number} audioTimeSeconds
	 * @param {number} fps
	 * @returns {number} the global frame index that was set
	 */
	export function setAudioTime(audioTimeSeconds, fps = 24) {
		if (!pool || (isVideoPool(pool) ? pool.entries.length === 0 : pool.totalFrames === 0))
			return 0;

		isExternallyControlled = true;
		frameUpdatedThisCycle = true;

		const clipInfo = pool.getClipInfo(currentClipIndex);
		if (!clipInfo) {
			globalFrameIndex = Math.floor(audioTimeSeconds * fps) % (pool.totalFrames || 1);
			return globalFrameIndex;
		}

		let targetFrame;
		if (useDirectFrameMapping) {
			targetFrame = Math.floor(audioTimeSeconds * fps);
		} else {
			const elapsedTime = Math.max(0, audioTimeSeconds - clipStartRampedTime);
			targetFrame = Math.floor(elapsedTime * fps);
		}

		if (jumpFrameOffset !== 0) {
			targetFrame += jumpFrameOffset;
			jumpFrameOffset = 0;
		}

		clipLocalFrame =
			((targetFrame % clipInfo.frameCount) + clipInfo.frameCount) % clipInfo.frameCount;
		globalFrameIndex = clipInfo.startFrame + clipLocalFrame;

		if (isVideoPool(pool)) {
			const timeSec = clipLocalFrame / fps;
			pool.seekActive(timeSec);
		}

		return globalFrameIndex;
	}

	export function getVideoTime(fps = 24) {
		return globalFrameIndex / fps;
	}

	/** Render the current frame and return the canvas (used for still capture). */
	export function getCanvas() {
		return canvas;
	}

	// === Reactive Updates ===

	// Intentionally non-reactive change-tracking cache (not rendered state)
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	let lastUniformValues = new Map();

	$effect(() => {
		if (!material?.uniforms || !uniforms) return;

		for (const key in uniforms) {
			const newValue = uniforms[key]?.value;
			const lastValue = lastUniformValues.get(key);

			if (lastValue === newValue) continue;
			if (Array.isArray(newValue) && Array.isArray(lastValue)) {
				if (newValue.length === lastValue.length && newValue.every((v, i) => v === lastValue[i])) {
					continue;
				}
			}

			lastUniformValues.set(key, Array.isArray(newValue) ? [...newValue] : newValue);

			if (material.uniforms[key]) {
				if (Array.isArray(newValue)) {
					if (newValue.length === 2 && material.uniforms[key].value instanceof THREE.Vector2) {
						material.uniforms[key].value.set(newValue[0], newValue[1]);
					} else if (
						newValue.length === 3 &&
						material.uniforms[key].value instanceof THREE.Vector3
					) {
						material.uniforms[key].value.set(newValue[0], newValue[1], newValue[2]);
					} else {
						material.uniforms[key].value = newValue;
					}
				} else {
					material.uniforms[key].value = newValue;
				}
			} else {
				if (Array.isArray(newValue)) {
					if (newValue.length === 2) {
						material.uniforms[key] = { value: new THREE.Vector2(newValue[0], newValue[1]) };
					} else if (newValue.length === 3) {
						material.uniforms[key] = {
							value: new THREE.Vector3(newValue[0], newValue[1], newValue[2])
						};
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
			// Ensure all uniforms exist before swapping the shader to avoid
			// compilation errors from missing uniforms.
			for (const key in uniforms) {
				if (!material.uniforms[key]) {
					const value = uniforms[key].value;
					if (Array.isArray(value)) {
						if (value.length === 2) {
							material.uniforms[key] = { value: new THREE.Vector2(value[0], value[1]) };
						} else if (value.length === 3) {
							material.uniforms[key] = { value: new THREE.Vector3(value[0], value[1], value[2]) };
						} else {
							material.uniforms[key] = { value };
						}
					} else {
						material.uniforms[key] = { value };
					}
				}
			}

			const newFragmentShader = filtersEnabled
				? fragmentShader || defaultFragmentShader
				: defaultFragmentShader;

			if (material.fragmentShader !== newFragmentShader) {
				try {
					material.fragmentShader = newFragmentShader;
					material.needsUpdate = true;
					if (renderer && scene && camera) {
						renderer.compile(scene, camera);
					}
				} catch (error) {
					console.error('[ShaderPlayer] Shader compilation error:', error);
					material.fragmentShader = defaultFragmentShader;
					material.needsUpdate = true;
				}
			}
		}
	});

	// Reset when the pool's content changes
	$effect(() => {
		if (pool && (isVideoPool(pool) ? pool.entries?.length > 0 : pool.totalFrames > 0)) {
			globalFrameIndex = 0;
			accumulatedTime = 0;
			if (!isVideoPool(pool)) pool.primeAroundFrame(0);
		}
	});
</script>

<div class="player-container">
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.player-container {
		width: 100%;
		height: 100%;
		position: relative;
		background-color: #000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
</style>
