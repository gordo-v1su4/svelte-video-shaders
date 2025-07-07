<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';

	let { src, fragmentShader } = $props();

	let canvas;
	let video;
	let renderer, scene, camera, mesh;
	let animationFrameId;
	let videoReady = $state(false);
	let hasInteracted = $state(false);

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

		const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
		mesh.scale.x = videoAspect;

		videoReady = true;
		handleResize(); // Update camera for new aspect ratio
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
		renderer.render(scene, camera);
	}

	function handleResize() {
		if (!renderer || !camera) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		console.log(`[ShaderPlayer] Resizing to ${width}x${height}`);

		renderer.setSize(width, height);
		camera.aspect = width / height;

		// Adjust camera to fit the plane
		const planeHeight = 2; // The height of our PlaneGeometry
		const fov = camera.fov * (Math.PI / 180);
		const distance = planeHeight / (2 * Math.tan(fov / 2));
		camera.position.z = distance;

		camera.updateProjectionMatrix();
	}

	onMount(() => {
		console.log('[ShaderPlayer] Component mounted. Initializing three.js...');
		scene = new THREE.Scene();
		camera = new THREE.PerspectiveCamera(75, 2, 0.1, 1000);
		renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });

		const geometry = new THREE.PlaneGeometry(2, 2);
		const material = new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms: {
				u_texture: { value: null }
			}
		});
		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		window.addEventListener('resize', handleResize);
		handleResize();

		animate();
		console.log('[ShaderPlayer] three.js initialized.');
	});

	$effect(() => {
		if (mesh) {
			console.log('[ShaderPlayer] Updating fragment shader.');
			mesh.material.fragmentShader = fragmentShader;
			mesh.material.needsUpdate = true;
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

	{#if videoReady && !hasInteracted}
		<div class="play-overlay">
			<span>Click to Play</span>
		</div>
	{/if}
</div>

<style>
	.player-wrapper {
		position: relative;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
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
	}
</style>
