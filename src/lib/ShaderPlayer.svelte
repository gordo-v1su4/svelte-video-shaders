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
		console.log('[Tracer] onMount: Component mounting.');
		if (!canvas) {
			console.error('[Tracer] onMount: Canvas element not found.');
			return;
		}
		console.log('[Tracer] onMount: Canvas element found.');

		// Initialize Three.js with simplified setup
		try {
			canvas.width = 640;
			canvas.height = 360;
			console.log(`[Tracer] onMount: Canvas size set to ${canvas.width}x${canvas.height}`);
			
			// 1. Create renderer
			renderer = new THREE.WebGLRenderer({ canvas });
			renderer.setSize(640, 360, false);
			renderer.setClearColor(0x000000); // Black background
			console.log('[Tracer] onMount: Three.js renderer created');
			
			// 2. Create scene
			scene = new THREE.Scene();
			
			// 3. Create orthographic camera to fill entire canvas
			camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
			camera.position.z = 1;
			console.log('[Tracer] onMount: Orthographic camera positioned');
			
			// 4. Create video texture and material
			const placeholder = document.createElement('canvas');
			placeholder.width = 640;
			placeholder.height = 360;
			const ctx = placeholder.getContext('2d');
			ctx.fillStyle = '#444444';
			ctx.fillRect(0, 0, 640, 360);
			ctx.fillStyle = '#ffffff';
			ctx.font = '20px Arial';
			ctx.textAlign = 'center';
			ctx.fillText('Upload a video to begin', 320, 180);
			
			texture = new THREE.CanvasTexture(placeholder);
			texture.needsUpdate = true;
			
			material = new THREE.MeshBasicMaterial({ 
				map: texture
			});
			console.log('[Tracer] onMount: Video texture material created');
			
			// 5. Create geometry to fill entire screen (-1 to 1)
			const geometry = new THREE.PlaneGeometry(2, 2);
			mesh = new THREE.Mesh(geometry, material);
			scene.add(mesh);
			console.log('[Tracer] onMount: Green mesh fills entire canvas now');
			
			// 6. Start render loop
			function render() {
				if (renderer && scene && camera) {
					renderer.render(scene, camera);
					animationFrameId = requestAnimationFrame(render);
				}
			}
			render();
			console.log('[Tracer] onMount: Render loop started - you should see GREEN square!');
			
		} catch (e) {
			console.error('[Tracer] onMount: Error during Three.js setup.', e);
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

	// Essential video processing functions
	export function loadVideo(videoFile) {
		console.log('[Tracer] loadVideo: Starting video load process', videoFile);
		if (!videoFile) {
			console.error('[Tracer] loadVideo: No video file provided');
			return;
		}
		
		// Update placeholder to show loading
		if (texture) {
			const placeholder = document.createElement('canvas');
			placeholder.width = 640;
			placeholder.height = 360;
			const ctx = placeholder.getContext('2d');
			ctx.fillStyle = '#222222';
			ctx.fillRect(0, 0, 640, 360);
			ctx.fillStyle = '#ffffff';
			ctx.font = '20px Arial';
			ctx.textAlign = 'center';
			ctx.fillText('Loading video...', 320, 180);
			
			texture.image = placeholder;
			texture.needsUpdate = true;
			console.log('[Tracer] loadVideo: Updated texture to show loading message');
		}
		
		// Initialize video processing
		initializeVideoProcessing(videoFile);
	}

	function initializeVideoProcessing(videoFile) {
		console.log('[Tracer] initializeVideoProcessing: Setting up MP4Box and WebCodecs');
		
		// Create MP4Box file instance
		mp4boxfile = MP4Box.createFile();
		
		// Set up MP4Box event handlers
		mp4boxfile.onReady = function(info) {
			console.log('[Tracer] MP4Box onReady:', info);
			
			const videoTrack = info.tracks.find(track => track.type === 'video');
			if (!videoTrack) {
				console.error('[Tracer] No video track found');
				return;
			}
			
			console.log('[Tracer] Video track found:', videoTrack);
			setupVideoDecoder(videoTrack);
		};
		
		mp4boxfile.onSamples = function(track_id, ref, samples) {
			console.log(`[Tracer] MP4Box onSamples: ${samples.length} samples for track ${track_id}`);
			
			for (const sample of samples) {
				if (videoDecoder && videoDecoder.state === 'configured') {
					try {
						const chunk = new EncodedVideoChunk({
							type: sample.is_sync ? 'key' : 'delta',
							timestamp: sample.cts * 1000,
							data: sample.data
						});
						videoDecoder.decode(chunk);
					} catch (e) {
						console.error('[Tracer] Error decoding chunk:', e);
					}
				}
			}
		};
		
		// Read the video file
		const reader = new FileReader();
		reader.onload = function(e) {
			const arrayBuffer = e.target.result;
			arrayBuffer.fileStart = 0;
			mp4boxfile.appendBuffer(arrayBuffer);
			mp4boxfile.flush();
			console.log('[Tracer] Video file loaded into MP4Box');
		};
		reader.readAsArrayBuffer(videoFile);
	}

	function setupVideoDecoder(videoTrack) {
		console.log('[Tracer] setupVideoDecoder: Configuring WebCodecs decoder');
		
		try {
			// Extract codec configuration
			let description = null;
			if (videoTrack.codec === 'avc1') {
				// Extract AVC configuration
				const trak = mp4boxfile.getTrackById(videoTrack.id);
				if (trak && trak.mdia && trak.mdia.minf && trak.mdia.minf.stbl && trak.mdia.minf.stbl.stsd) {
					const avcC = trak.mdia.minf.stbl.stsd.entries[0].avcC;
					if (avcC && avcC.config) {
						description = new Uint8Array(avcC.config);
						console.log('[Tracer] AVC configuration extracted:', description.length, 'bytes');
					}
				}
			}
			
			const config = {
				codec: videoTrack.codec,
				codedWidth: videoTrack.video.width,
				codedHeight: videoTrack.video.height
			};
			
			if (description) {
				config.description = description;
			}
			
			console.log('[Tracer] VideoDecoder config:', config);
			
			videoDecoder = new VideoDecoder({
				output: handleVideoFrame,
				error: (e) => console.error('[Tracer] VideoDecoder error:', e)
			});
			
			videoDecoder.configure(config);
			console.log('[Tracer] VideoDecoder configured successfully');
			
			// Start decoding
			mp4boxfile.start();
			
		} catch (e) {
			console.error('[Tracer] Error setting up video decoder:', e);
		}
	}

	function handleVideoFrame(frame) {
		console.log(`[Tracer] handleVideoFrame: Frame received ${frame.displayWidth}x${frame.displayHeight}`);
		
		if (texture && renderer) {
			try {
				// Create a canvas to draw the video frame
				const canvas = document.createElement('canvas');
				canvas.width = frame.displayWidth;
				canvas.height = frame.displayHeight;
				
				const ctx = canvas.getContext('2d');
				ctx.drawImage(frame, 0, 0);
				
				// Update Three.js texture
				texture.image = canvas;
				texture.needsUpdate = true;
				
				console.log('[Tracer] Video frame rendered to texture');
			} catch (e) {
				console.error('[Tracer] Error rendering video frame:', e);
			}
		}
		
		// Always close the frame to prevent memory leaks
		frame.close();
	}

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
		if (renderer && scene && camera) {
			// Debug: Log render info every 60 frames
			if (animationFrameId % 60 === 0) {
				console.log('[Tracer] render: Rendering frame', {
					scene: !!scene,
					camera: !!camera,
					mesh: !!mesh,
					meshVisible: mesh?.visible,
					texture: !!texture,
					material: !!material,
					rendererSize: `${renderer.domElement.width}x${renderer.domElement.height}`
				});
			}
			renderer.clear();
			renderer.render(scene, camera);
			animationFrameId = requestAnimationFrame(render);
		} else {
			console.warn('[Tracer] render: Missing renderer, scene, or camera');
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
