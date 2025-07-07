<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';

	let { src, fragmentShader, uniforms } = $props();

	let canvas;
	let video;
	let renderer, scene, camera, mesh;
	let animationFrameId;
	let hasInteracted = $state(false);
	const clock = new THREE.Clock();

	const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

	function onVideoReady(event) {
		console.log('[ShaderPlayer] Video metadata loaded.');
		const videoEl = event.target;
		const texture = new THREE.VideoTexture(videoEl);
		mesh.material.uniforms.u_texture.value = texture;
		handleResize();
	}

	function handlePlay() {
		console.log('[ShaderPlayer] Video is playing.');
	}

	function handleError(e) {
		console.error('[ShaderPlayer] Video playback error:', e);
	}

	function startPlayback() {
		if (video) {
			video.play().catch(handleError);
			hasInteracted = true;
		}
	}

	function animate() {
		animationFrameId = requestAnimationFrame(animate);
		if (mesh) {
			mesh.material.uniforms.u_time.value = clock.getElapsedTime();
		}
		renderer.render(scene, camera);
	}

	/**
	 * Handles resizing of the canvas and camera.
	 *
	 * --- DOCUMENTATION ---
	 * This is the definitive and correct way to handle sizing for this component.
	 *
	 * 1.  We use an OrthographicCamera because we want a 2D projection with no perspective distortion.
	 * 2.  The camera's frustum (left, right, top, bottom) is set to match the pixel dimensions of the canvas.
	 *     This makes one unit in our scene correspond to one pixel on the canvas.
	 * 3.  The PlaneGeometry is created with a size of 1x1.
	 * 4.  When the video is ready, we set the mesh's scale to the video's actual width and height.
	 * 5.  To control the final on-screen size, we apply a scale factor (e.g., 0.5 for half size) to the mesh scale.
	 */
	function handleResize() {
		if (!renderer || !camera || !canvas) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		renderer.setSize(width, height);

		camera.left = -width / 2;
		camera.right = width / 2;
		camera.top = height / 2;
		camera.bottom = -height / 2;
		camera.updateProjectionMatrix();

		if (video && video.videoWidth > 0) {
			const scaleFactor = 0.5;
			const videoWidth = video.videoWidth * scaleFactor;
			const videoHeight = video.videoHeight * scaleFactor;
			mesh.scale.set(videoWidth, videoHeight, 1);
		}
	}

	onMount(() => {
		console.log('[ShaderPlayer] Component mounted. Initializing three.js...');
		scene = new THREE.Scene();
		camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
		renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });

		const geometry = new THREE.PlaneGeometry(1, 1);
		const material = new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms: {
				...uniforms,
				u_texture: { value: null },
				u_time: { value: 0.0 }
			},
			transparent: true
		});
		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		camera.position.z = 1;
		window.addEventListener('resize', handleResize);
		handleResize();
		animate();
		console.log('[ShaderPlayer] three.js initialized.');
	});

	$effect(() => {
		if (mesh && fragmentShader) {
			console.log('[ShaderPlayer] Updating fragment shader.');
			mesh.material.fragmentShader = fragmentShader;
			mesh.material.needsUpdate = true;
		}
	});

	$effect(() => {
		if (mesh && uniforms) {
			for (const key in uniforms) {
				if (mesh.material.uniforms[key]) {
					mesh.material.uniforms[key].value = uniforms[key].value;
				}
			}
		}
	});

	onDestroy(() => {
		console.log('[ShaderPlayer] Component destroyed.');
		window.removeEventListener('resize', handleResize);
		cancelAnimationFrame(animationFrameId);
		if (renderer) {
			renderer.dispose();
		}
	});
</script>

<div class="player-wrapper" onclick={startPlayback} role="button" tabindex="0">
	<video
		bind:this={video}
		{src}
		autoplay
		loop
		muted
		playsinline
		crossOrigin="anonymous"
		style="display:none;"
		onloadedmetadata={onVideoReady}
		onplay={handlePlay}
		onerror={handleError}
	></video>
	<canvas bind:this={canvas}></canvas>
	{#if !hasInteracted}
		<div class="play-overlay">
			<span>Click to Play</span>
		</div>
	{/if}
</div>

<style>
	.player-wrapper {
		width: 100%;
		height: 100%;
		position: relative;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
	.play-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		font-size: 1.5rem;
		font-family: sans-serif;
		cursor: pointer;
	}
</style>