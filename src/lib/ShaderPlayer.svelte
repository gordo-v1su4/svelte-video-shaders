<script>
	import { onMount, onDestroy } from 'svelte';
	import * as THREE from 'three';
	import * as MP4Box from 'mp4box';

	let {
		file,
		fragmentShader,
		uniforms = {}
	} = $props();

	// Internal state
	let canvas;
	let showOverlay = $state(true);
	let isPlaying = $state(false);

	// three.js state
	let renderer, scene, camera, material, mesh;
	let texture = null; // Texture will be created from the first frame
	let animationFrameId;
	let videoDimensions = $state({ width: 1, height: 1 });

	// Playback loop state
	let frameQueue = [];
	let videoStartTime = 0;
	let currentFrame = null;

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

	// WebCodecs state
	let videoDecoder;
	let mp4boxfile;

	onMount(() => {
		if (!canvas) return;

		renderer = new THREE.WebGLRenderer({ canvas });
		scene = new THREE.Scene();
		camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
		camera.position.z = 1;
		
		material = new THREE.ShaderMaterial({
			uniforms: { u_texture: { value: null } }, // Start with null texture
			vertexShader,
			fragmentShader: fragmentShader || defaultFragmentShader
		});
		
		const geometry = new THREE.PlaneGeometry(2, 2);
		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);
		
		handleResize();
		window.addEventListener('resize', handleResize);
		
		render();

		return () => {
			window.removeEventListener('resize', handleResize);
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
			if (videoDecoder) videoDecoder.close();
			if (mp4boxfile) mp4boxfile.stop();
			if (renderer) renderer.dispose();
			frameQueue.forEach(frame => frame.close());
			if (currentFrame) currentFrame.close();
		};
	});

	function handleResize() {
		if (!renderer || !mesh) return;

		const canvasWidth = canvas.clientWidth;
		const canvasHeight = canvas.clientHeight;
		renderer.setSize(canvasWidth, canvasHeight, false);

		const videoAspect = videoDimensions.width / videoDimensions.height;
		const canvasAspect = canvasWidth / canvasHeight;

		if (canvasAspect > videoAspect) {
			mesh.scale.x = videoAspect / canvasAspect;
			mesh.scale.y = 1;
		} else {
			mesh.scale.x = 1;
			mesh.scale.y = canvasAspect / videoAspect;
		}
	}

	function render() {
		animationFrameId = requestAnimationFrame(render);

		if (isPlaying && videoStartTime > 0 && frameQueue.length > 0) {
			const elapsedTimeMs = performance.now() - videoStartTime;
			const nextFrameTimeMs = frameQueue[0].timestamp / 1000;

			if (elapsedTimeMs >= nextFrameTimeMs) {
				const newFrame = frameQueue.shift();

				if (!currentFrame) {
					// First frame: create the texture now that we have dimensions
					texture = new THREE.CanvasTexture(newFrame);
					texture.minFilter = THREE.LinearFilter;
					texture.magFilter = THREE.LinearFilter;
					texture.format = THREE.RGBAFormat;
					texture.generateMipmaps = false;
					material.uniforms.u_texture.value = texture;
				} else {
					// Subsequent frames: update image and close the old frame
					texture.image = newFrame;
					texture.needsUpdate = true;
					currentFrame.close(); // IMPORTANT: close the old frame
				}
				currentFrame = newFrame;
			}
		}
		renderer.render(scene, camera);
	}

	function initializeVideoProcessing(videoFile) {
		mp4boxfile = MP4Box.createFile();
		
		mp4boxfile.onReady = (info) => {
			const videoTrack = info.tracks.find(track => track.type === 'video');
			if (!videoTrack) return console.error('No video track found');
			
			videoDimensions = { width: videoTrack.video.width, height: videoTrack.video.height };
			handleResize();
			setupVideoDecoder(videoTrack);
		};
		
		mp4boxfile.onSamples = (track_id, ref, samples) => {
			for (const sample of samples) {
				if (videoDecoder?.state === 'configured') {
					videoDecoder.decode(new EncodedVideoChunk({
						type: sample.is_sync ? 'key' : 'delta',
						timestamp: sample.cts,
						duration: sample.duration,
						data: sample.data
					}));
				}
			}
		};
		
		const reader = new FileReader();
		reader.onload = (e) => {
			const arrayBuffer = e.target.result;
			arrayBuffer.fileStart = 0;
			mp4boxfile.appendBuffer(arrayBuffer);
			mp4boxfile.flush();
		};
		reader.readAsArrayBuffer(videoFile);
	}

	function setupVideoDecoder(videoTrack) {
		const config = {
			codec: videoTrack.codec,
			codedWidth: videoTrack.video.width,
			codedHeight: videoTrack.video.height,
		};

		if (videoTrack.codec.startsWith('avc1')) {
			const trak = mp4boxfile.getTrackById(videoTrack.id);
			const avcC = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0]?.avcC;
			if (avcC) {
				const descriptionStart = avcC.start + 8;
				const descriptionSize = avcC.size - 8;
				config.description = mp4boxfile.stream.buffer.slice(descriptionStart, descriptionStart + descriptionSize);
			} else {
				return console.error("Failed to extract AVC configuration.");
			}
		}
		
		videoDecoder = new VideoDecoder({
			output: (frame) => frameQueue.push(frame),
			error: (e) => console.error('VideoDecoder error:', e)
		});
		
		videoDecoder.configure(config);
		mp4boxfile.setExtractionOptions(videoTrack.id);
		mp4boxfile.start();
	}

	function start() {
		showOverlay = false;
		isPlaying = true;
		frameQueue = [];
		videoStartTime = performance.now();
		initializeVideoProcessing(file);
	}

	$effect(() => {
		if (material?.uniforms) {
			for (const key in uniforms) {
				if (material.uniforms[key]) {
					material.uniforms[key].value = uniforms[key].value;
				}
			}
		}
	});

	$effect(() => {
		if (material) {
			material.fragmentShader = fragmentShader || defaultFragmentShader;
			material.needsUpdate = true;
		}
	});

	$effect(() => {
		if (file && renderer) {
			start();
		}
	});
</script>

<div class="player-container">
	<canvas bind:this={canvas}></canvas>
	{#if showOverlay}
		<button class="play-overlay" onclick={start}>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
				><path
					d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"
				/></svg
			>
			<span>Click to Play</span>
		</button>
	{/if}
</div>

<style>
	.player-container {
		width: 100%;
		height: 100%;
		position: relative;
		background-color: #000;
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
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		color: white;
		cursor: pointer;
		transition: opacity 0.3s ease;
        border: none;
        padding: 0;
        font-family: inherit;
	}

	.play-overlay:hover {
		background-color: rgba(0, 0, 0, 0.7);
	}

	.play-overlay svg {
		width: 80px;
		height: 80px;
		margin-bottom: 1rem;
	}

	.play-overlay span {
		font-size: 1.5rem;
		font-weight: bold;
	}
</style>
