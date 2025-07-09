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
	let renderer, scene, camera, material, texture, mesh;
	let animationFrameId;

	// WebCodecs state
	let videoDecoder;
	let mp4boxfile;

	onMount(() => {
		console.log('[Tracer] onMount: Component mounted.');
		if (!canvas) {
			console.error('[Tracer] onMount: Canvas element not found!');
			return;
		}
		console.log('[Tracer] onMount: Canvas element found.');

		// 1. Initialize three.js
		try {
			renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
			scene = new THREE.Scene();
			camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
			console.log('[Tracer] onMount: Three.js renderer, scene, and camera initialized.');

			const placeholder = document.createElement('canvas');
			placeholder.width = 1;
			placeholder.height = 1;
			texture = new THREE.CanvasTexture(placeholder);
			console.log('[Tracer] onMount: Placeholder texture created.');

			material = new THREE.ShaderMaterial({
				uniforms: {
					u_texture: { value: texture },
					...uniforms
				},
				vertexShader: `
					varying vec2 v_uv;
					void main() {
						v_uv = uv;
						gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
					}
				`,
				fragmentShader: fragmentShader || `
					varying vec2 v_uv;
					uniform sampler2D u_texture;
					void main() {
						gl_FragColor = texture2D(u_texture, v_uv);
					}
				`
			});
			console.log('[Tracer] onMount: Shader material created.');

			const geometry = new THREE.PlaneGeometry(2, 2);
			mesh = new THREE.Mesh(geometry, material);
			scene.add(mesh);
			console.log('[Tracer] onMount: Mesh created and added to scene.');

			handleResize();
			window.addEventListener('resize', handleResize);

			// 2. Start the render loop
			render();
			console.log('[Tracer] onMount: Initial resize and render loop started.');
		} catch (e) {
			console.error('[Tracer] onMount: Error during Three.js initialization.', e);
		}


		return () => {
			console.log('[Tracer] onDestroy: Component unmounting.');
			window.removeEventListener('resize', handleResize);
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
			if (videoDecoder) videoDecoder.close();
			if(mp4boxfile) mp4boxfile.stop();
			if(renderer) renderer.dispose();
			console.log('[Tracer] onDestroy: Cleanup complete.');
		};
	});

	function handleResize() {
		if (!renderer || !canvas || !camera || !mesh) return;
		const container = canvas.parentElement;
		if (!container) return;

		const { width, height } = container.getBoundingClientRect();
		renderer.setSize(width, height);

		const videoAspectRatio = (texture.image?.codedWidth || 16) / (texture.image?.codedHeight || 9);
		const containerAspectRatio = width / height;

		if (containerAspectRatio > videoAspectRatio) {
			mesh.scale.x = videoAspectRatio / containerAspectRatio;
			mesh.scale.y = 1;
		} else {
			mesh.scale.x = 1;
			mesh.scale.y = containerAspectRatio / videoAspectRatio;
		}
	}

	function render() {
		if (renderer) {
			renderer.render(scene, camera);
			animationFrameId = requestAnimationFrame(render);
		}
	}

	async function start() {
		console.log('[Tracer] start: Playback triggered.');
		showOverlay = false;
		isPlaying = true;

		if (!window.VideoDecoder) {
			console.error('[Tracer] start: FATAL - WebCodecs API not supported.');
			return;
		}

		try {
			console.log('[Tracer] start: Setting up WebCodecs pipeline...');
			mp4boxfile = MP4Box.createFile();
			console.log('[Tracer] start: MP4Box file created.');

			mp4boxfile.onReady = (info) => {
				console.log('[Tracer] mp4box.onReady: MP4Box is ready.', info);
				const videoTrack = info.tracks.find((t) => t.type === 'video');
				if (!videoTrack) {
					console.error('[Tracer] mp4box.onReady: FATAL - No video track found in the file.');
					return;
				}
				console.log('[Tracer] mp4box.onReady: Video track found. Inspecting in next log.');
				console.log('[Tracer] mp4box.onReady: Full videoTrack structure:', videoTrack);
				console.log('[Tracer] mp4box.onReady: Track mdia structure:', videoTrack.mdia);
				console.log('[Tracer] mp4box.onReady: Track samples structure:', videoTrack.samples);
				console.log('[Tracer] mp4box.onReady: Track codec_private structure:', videoTrack.codec_private);
				console.log('[Tracer] mp4box.onReady: MP4Box info structure:', info);
				if (videoTrack.mdia?.minf?.stbl?.stsd) {
					console.log('[Tracer] mp4box.onReady: stsd structure:', videoTrack.mdia.minf.stbl.stsd);
				}

				videoDecoder = new VideoDecoder({
					output: (frame) => {
						if (texture) {
							// console.log('[Tracer] videoDecoder.output: Frame received, updating texture.', frame.timestamp);
							texture.image = frame;
							texture.needsUpdate = true;
							if (frame.codedWidth) { // First frame will have dimensions
								handleResize();
							}
						}
						frame.close();
					},
					error: (e) => {
						console.error('[Tracer] videoDecoder.error: Decoder error.', e);
					}
				});
				console.log('[Tracer] mp4box.onReady: VideoDecoder created.');

				const config = {
					codec: videoTrack.codec,
					codedWidth: videoTrack.track_width,
					codedHeight: videoTrack.track_height,
					optimizeForLatency: true
				};

				// For H.264/AVC, the description is required. Extract it from the track.
				if (videoTrack.codec.startsWith('avc1')) {
					console.log('[Tracer] mp4box.onReady: H.264 codec detected, searching for avcC description.');
					
					// The correct way to get avcC description from MP4Box
					try {
						// First try the new MP4Box method
						if (mp4boxfile.getTrackById) {
							const track = mp4boxfile.getTrackById(videoTrack.id);
							console.log('[Tracer] mp4box.onReady: Full track from getTrackById:', track);
							
							// Check if track has sample descriptions
							if (track && track.mdia && track.mdia.minf && track.mdia.minf.stbl && track.mdia.minf.stbl.stsd) {
								const stsd = track.mdia.minf.stbl.stsd;
								console.log('[Tracer] mp4box.onReady: Found stsd:', stsd);
								
								if (stsd.entries && stsd.entries.length > 0) {
									const entry = stsd.entries[0];
									console.log('[Tracer] mp4box.onReady: First stsd entry:', entry);
									
									if (entry.avcC && entry.avcC.data) {
										console.log('[Tracer] mp4box.onReady: Found avcC data in stsd entry.');
										config.description = entry.avcC.data;
									}
								}
							}
						}
						
						// Fallback: Try direct access to info structure
						if (!config.description && info.tracks) {
							const infoTrack = info.tracks.find(t => t.id === videoTrack.id);
							if (infoTrack) {
								console.log('[Tracer] mp4box.onReady: Found track in info.tracks:', infoTrack);
								
								// Check for codec private data
								if (infoTrack.codec_private) {
									console.log('[Tracer] mp4box.onReady: Using codec_private from info track.');
									config.description = infoTrack.codec_private;
								}
								// Check for avcC in track
								else if (infoTrack.avcC) {
									console.log('[Tracer] mp4box.onReady: Using avcC from info track.');
									config.description = infoTrack.avcC;
								}
							}
						}
						
						// Last resort: Try to extract from samples
						if (!config.description) {
							console.log('[Tracer] mp4box.onReady: Trying to extract avcC from file structure...');
							
							// Log the full info structure to debug
							console.log('[Tracer] mp4box.onReady: Full info structure for debugging:', JSON.stringify(info, null, 2));
						}
						
					} catch (e) {
						console.log('[Tracer] mp4box.onReady: Error while extracting avcC:', e);
					}
					
					if (!config.description) {
						console.log('[Tracer] mp4box.onReady: WARNING - No avcC description found. This will likely cause decode failures.');
					} else {
						console.log('[Tracer] mp4box.onReady: Successfully found avcC description, length:', config.description.byteLength || config.description.length);
					}
				}

				console.log('[Tracer] mp4box.onReady: Configuring decoder with:', config);
				videoDecoder.configure(config);

				mp4boxfile.setExtractionOptions(videoTrack.id);
				mp4boxfile.start();
				console.log('[Tracer] mp4box.onReady: Extraction started.');
			};

			mp4boxfile.onSamples = (track_id, user, samples) => {
				console.log(`[Tracer] mp4box.onSamples: Received ${samples.length} samples.`);
				for (const sample of samples) {
					const chunk = new EncodedVideoChunk({
						type: sample.is_sync ? 'key' : 'delta',
						timestamp: sample.cts,
						duration: sample.duration,
						data: sample.data
					});
					if (videoDecoder.state === 'configured') {
						videoDecoder.decode(chunk);
					}
				}
			};

			console.log(`[Tracer] start: Getting ArrayBuffer from file: ${file.name}`);
			const buffer = await file.arrayBuffer();
			console.log(`[Tracer] start: ArrayBuffer received, ${buffer.byteLength} bytes. Appending to MP4Box.`);
			buffer.fileStart = 0;
			mp4boxfile.appendBuffer(buffer);
            mp4boxfile.flush();
			console.log('[Tracer] start: MP4Box file flushed.');
		} catch (error) {
			console.error('[Tracer] start: FATAL - Failed to start WebCodecs pipeline:', error);
		}
	}

	export function play() {
		console.log('[Tracer] play: Exported play function called.');
		if (!isPlaying) {
			start();
		} else {
			console.log('[Tracer] play: Already playing.');
		}
	}

	export function pause() {
		console.log('[Tracer] pause: Pause requested.');
		isPlaying = false;
	}

	$effect(() => {
		if (material) {
			for (const key in uniforms) {
				if (material.uniforms[key]) {
					material.uniforms[key].value = uniforms[key].value;
				}
			}
		}
	});

	$effect(() => {
		if (material && fragmentShader) {
			console.log('[Tracer] $effect: Fragment shader changed.');
			material.fragmentShader = fragmentShader;
			material.needsUpdate = true;
		}
	});
</script>

<div class="player-container">
	<canvas bind:this={canvas}></canvas>
	{#if showOverlay}
		<div 
			class="play-overlay" 
			onclick={start}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && start()}
			role="button"
			tabindex="0"
			aria-label="Click to play video"
		>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
				><path
					d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"
				/></svg
			>
			<span>Click to Play</span>
		</div>
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
