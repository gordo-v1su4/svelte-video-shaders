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

	function handleResize(videoWidth, videoHeight) {
		if (!renderer || !canvas || !camera) return;

		// Set renderer to fixed canvas size (640x360)
		renderer.setSize(640, 360);
		console.log(`[Tracer] handleResize: Set renderer size to 640x360`);

		// Keep camera simple: standard orthographic -1 to 1
		camera.left = -1;
		camera.right = 1;
		camera.top = 1;
		camera.bottom = -1;
		camera.updateProjectionMatrix();
		console.log('[Tracer] handleResize: Camera frustum set to -1 to 1');

		// No mesh scaling needed - 2x2 plane already covers -1 to 1 space
		if (mesh) {
			mesh.scale.set(1, 1, 1);
			console.log('[Tracer] handleResize: Mesh scale reset to 1,1,1');
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
				console.log(videoTrack);
				console.log('[Tracer] mp4box.onReady: VideoTrack keys:', Object.keys(videoTrack));
				
				// Check for AVC configuration in different locations
				console.log('[Tracer] mp4box.onReady: VideoTrack.avcC:', videoTrack.avcC);
				console.log('[Tracer] mp4box.onReady: VideoTrack.description:', videoTrack.description);
				console.log('[Tracer] mp4box.onReady: VideoTrack.hvcC:', videoTrack.hvcC);
				console.log('[Tracer] mp4box.onReady: VideoTrack.mimeCodec:', videoTrack.mimeCodec);
				console.log('[Tracer] mp4box.onReady: VideoTrack.samples_description:', videoTrack.samples_description);
				console.log('[Tracer] mp4box.onReady: VideoTrack.type:', videoTrack.type);
				console.log('[Tracer] mp4box.onReady: VideoTrack.codec:', videoTrack.codec);
				
				// Check MP4Box info object for AVC configuration
				console.log('[Tracer] mp4box.onReady: MP4Box info object:', info);
				console.log('[Tracer] mp4box.onReady: MP4Box info.tracks:', info.tracks);

				videoDecoder = new VideoDecoder({
					output: (frame) => {
						if (texture && renderer) {
							console.log('[Tracer] videoDecoder.output: Frame received, updating texture directly.', frame.timestamp);
							
							// Close the previous frame if it exists
							if (texture.image && texture.image.close) {
								texture.image.close();
							}
							
							// Recreate texture with correct video dimensions on first frame
							if (frame.codedWidth && !texture.hasCorrectDimensions) {
								console.log(`[Tracer] videoDecoder.output: Recreating texture with video dimensions ${frame.codedWidth}x${frame.codedHeight}`);
								
								// Create a new canvas with correct dimensions
								const newCanvas = document.createElement('canvas');
								newCanvas.width = frame.codedWidth;
								newCanvas.height = frame.codedHeight;
								
								// Dispose old texture and create new one
								texture.dispose();
								texture = new THREE.CanvasTexture(newCanvas);
								texture.hasCorrectDimensions = true;
								
								// Update material uniform
								material.uniforms.u_texture.value = texture;
								
								// Keep canvas size fixed - no resize to video dimensions
								console.log('[Tracer] videoDecoder.output: Texture recreated, keeping canvas at fixed 640x360 size');
							}
							
							// Store the frame for cleanup
							texture.image = frame;
							
							// Force Three.js to initialize the WebGL texture first
							texture.needsUpdate = true;
							renderer.render(scene, camera); // This forces texture initialization
							
							// Now try WebGL direct upload
							const gl = renderer.getContext();
							const glTexture = renderer.properties.get(texture).__webglTexture;
							
							console.log('[Tracer] videoDecoder.output: WebGL texture found:', !!glTexture);
							
							if (glTexture) {
								gl.bindTexture(gl.TEXTURE_2D, glTexture);
								
								try {
									// Use texSubImage2D for immutable textures (created with texStorage2D)
									gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame);
									console.log('[Tracer] videoDecoder.output: Successfully uploaded VideoFrame to WebGL texture');
								} catch (error) {
									console.error('[Tracer] videoDecoder.output: Error uploading VideoFrame to WebGL texture:', error);
									// Fallback to Three.js automatic texture handling
									texture.image = frame;
									texture.needsUpdate = true;
								}
								
								gl.bindTexture(gl.TEXTURE_2D, null);
							} else {
								console.warn('[Tracer] videoDecoder.output: WebGL texture not found, using Three.js automatic texture handling.');
								// Fallback to Three.js automatic texture handling
								texture.image = frame;
								texture.needsUpdate = true;
							}
							
							// Update texture version to trigger re-render
							texture.version++;
						} else {
							// If no texture, close the frame immediately
							frame.close();
						}
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

				// For H.264/AVC, the description is required. Extract it from the MP4Box track.
				if (videoTrack.codec.startsWith('avc1') || videoTrack.codec.startsWith('avc3')) {
					console.log('[Tracer] mp4box.onReady: H.264/AVC codec detected, extracting description.');
					
					// Use MP4Box.js getTrackById to get the proper AVC configuration
					const trackInfo = mp4boxfile.getTrackById(videoTrack.id);
					console.log('[Tracer] mp4box.onReady: Track info from getTrackById:', trackInfo);
					console.log('[Tracer] mp4box.onReady: TrackBox keys:', Object.keys(trackInfo));
					
					// Try to access the media info and sample description
					if (trackInfo && trackInfo.mdia && trackInfo.mdia.minf && trackInfo.mdia.minf.stbl && trackInfo.mdia.minf.stbl.stsd) {
						const stsd = trackInfo.mdia.minf.stbl.stsd;
						console.log('[Tracer] mp4box.onReady: Found stsd (sample description):', stsd);
						
						// Look for AVC configuration in sample description entries
						if (stsd.entries && stsd.entries.length > 0) {
							const entry = stsd.entries[0];
							console.log('[Tracer] mp4box.onReady: Sample description entry:', entry);
							
							if (entry.avcC) {
								console.log('[Tracer] mp4box.onReady: Found avcC in sample description!');
								console.log('[Tracer] mp4box.onReady: avcC object:', entry.avcC);
								
								// Convert avcC to ArrayBuffer for WebCodecs
								let avcCBuffer = null;
								
								// Try different methods to extract the raw bytes
								if (entry.avcC.data) {
									console.log('[Tracer] mp4box.onReady: Using avcC.data as ArrayBuffer');
									avcCBuffer = entry.avcC.data;
								} else if (entry.avcC.size && entry.avcC.start) {
									console.log('[Tracer] mp4box.onReady: Extracting avcC from file buffer');
									// Extract the raw bytes from the file buffer
									// The avcC box content starts after the 8-byte header (size + type)
									const avcCSize = entry.avcC.size - 8; // subtract header size
									const avcCStart = entry.avcC.start + 8; // skip header
									
									// Create a new ArrayBuffer and copy the avcC data
									avcCBuffer = new ArrayBuffer(avcCSize);
									const avcCView = new Uint8Array(avcCBuffer);
									
									// Access the file buffer through MP4Box
									const fileBuffer = mp4boxfile.stream.buffer;
									const sourceView = new Uint8Array(fileBuffer, avcCStart, avcCSize);
									avcCView.set(sourceView);
									
									console.log('[Tracer] mp4box.onReady: Extracted avcC from file buffer, size:', avcCSize);
								} else {
									console.error('[Tracer] mp4box.onReady: Cannot extract bytes from avcC object');
								}
								
								if (avcCBuffer) {
									console.log('[Tracer] mp4box.onReady: Setting avcC ArrayBuffer as description, size:', avcCBuffer.byteLength);
									config.description = avcCBuffer;
								} else {
									console.error('[Tracer] mp4box.onReady: Failed to convert avcC to ArrayBuffer');
								}
							} else {
								console.log('[Tracer] mp4box.onReady: No avcC in sample description entry.');
							}
						}
					}
					
					// If still no AVC config, try a different approach
					if (!config.description) {
						console.warn('[Tracer] mp4box.onReady: Trying to extract AVC config from MP4Box info structure.');
						
						// Alternative: try to extract from MP4Box info structure
						const infoTrack = info.tracks.find(t => t.id === videoTrack.id);
						if (infoTrack && infoTrack.avcC) {
							console.log('[Tracer] mp4box.onReady: Found avcC in info.tracks.');
							config.description = infoTrack.avcC;
						} else {
							console.error('[Tracer] mp4box.onReady: No AVC configuration found anywhere - decoder will fail.');
						}
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

	export function frameForward() {
		console.log('[Tracer] frameForward: Frame forward requested.');
		// TODO: Implement frame-by-frame forward logic
		// This would involve seeking to the next frame without continuous playback
	}

	export function frameBackward() {
		console.log('[Tracer] frameBackward: Frame backward requested.');
		// TODO: Implement frame-by-frame backward logic
		// This would involve seeking to the previous frame
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
		width: 640px;
		height: 360px;
		position: relative;
		background-color: #000;
		border: 2px solid #ff0000; /* Red border for debugging */
		margin: 20px;
	}

	canvas {
		display: block;
		width: 640px;
		height: 360px;
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
