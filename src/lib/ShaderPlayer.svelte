<script>
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import * as THREE from 'three';
	// The 'mp4box' library has a non-standard module format.
	// We must import it this way to make it compatible with Vite.
	import { default as MP4BoxModule } from 'mp4box';

	let { src, fragmentShader, uniforms, bind: player } = $props();

	const dispatch = createEventDispatcher();

	let canvas;
	let renderer, scene, camera, mesh;
	let animationFrameId;
	let videoDecoder;
	let mp4boxfile;
	let isPlaying = false;

	const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

	function onVideoFrame(frame) {
		if (mesh && mesh.material.uniforms.u_texture.value) {
			mesh.material.uniforms.u_texture.value.image = frame;
			mesh.material.uniforms.u_texture.value.needsUpdate = true;
		}
		frame.close();
	}

	function animate() {
		animationFrameId = requestAnimationFrame(animate);
		renderer.render(scene, camera);
	}

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
	}

	async function start() {
		try {
			console.log('[Player] Starting WebCodecs pipeline...');
			mp4boxfile = MP4BoxModule.createFile();

			mp4boxfile.onSamples = (track_id, ref, samples) => {
				for (const sample of samples) {
					const type = sample.is_sync ? 'key' : 'delta';
					const chunk = new EncodedVideoChunk({
						type,
						timestamp: sample.cts,
						duration: sample.duration,
						data: sample.data
					});
					if (videoDecoder.state === 'configured') {
						videoDecoder.decode(chunk);
					}
				}
			};

			mp4boxfile.onReady = (info) => {
				console.log('[MP4Box] Ready:', info);
				const track = info.videoTracks[0];
				if (VideoDecoder.isConfigSupported(track.codec)) {
					videoDecoder.configure({
						codec: track.codec,
						codedWidth: track.track_width,
						codedHeight: track.track_height
					});
					mp4boxfile.setExtractionOptions(track.id, null, { nbSamples: 100 });
					mp4boxfile.start();
				} else {
					console.error('Codec not supported:', track.codec);
				}
			};

			videoDecoder = new VideoDecoder({
				output: onVideoFrame,
				error: (e) => console.error('[Decoder]', e)
			});

			console.log('[Player] Fetching video...');
			const response = await fetch(src);
			if (!response.ok) {
				throw new Error(`Failed to fetch video: ${response.statusText}`);
			}
			const reader = response.body.getReader();
			let offset = 0;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					console.log('[Player] Fetch complete.');
					mp4boxfile.flush();
					break;
				}
				const buffer = value.buffer;
				buffer.fileStart = offset;
				offset += buffer.byteLength;
				mp4boxfile.appendBuffer(buffer);
			}
		} catch (e) {
			console.error('[Player] FATAL: Failed to start WebCodecs pipeline:', e);
		}
	}

	player = {
		play: () => {},
		pause: () => {},
		reset: () => {}
	};

	onMount(() => {
		console.log('[Player] Component mounted.');
		scene = new THREE.Scene();
		camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
		renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });

		const geometry = new THREE.PlaneGeometry(1, 1);
		const material = new THREE.ShaderMaterial({
			vertexShader,
			fragmentShader,
			uniforms: {
				...uniforms,
				u_texture: { value: new THREE.Texture() }
			},
			transparent: true
		});
		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		camera.position.z = 1;
		window.addEventListener('resize', handleResize);
		handleResize();
		animate();
		start();
		console.log('[Player] three.js initialized.');
	});

	$effect(() => {
		if (mesh && fragmentShader) {
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
		console.log('[Player] Component destroyed.');
		window.removeEventListener('resize', handleResize);
		cancelAnimationFrame(animationFrameId);
		if (renderer) renderer.dispose();
		if (videoDecoder) videoDecoder.close();
		if (mp4boxfile) mp4boxfile.stop();
	});
</script>

<canvas bind:this={canvas}></canvas>