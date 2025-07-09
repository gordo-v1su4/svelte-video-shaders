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
			// Clean up any remaining VideoFrame in texture
			if (texture && texture.image && texture.image.close) {
				texture.image.close();
			}
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
				
				// Validate MP4 file structure
				if (!info || !info.tracks || info.tracks.length === 0) {
					console.error('[Tracer] mp4box.onReady: Invalid MP4 file - no tracks found.');
					return;
				}
				
				console.log('[Tracer] mp4box.onReady: MP4 file validation:');
				console.log('  - Duration:', info.duration, 'ms');
				console.log('  - Timescale:', info.timescale);
				console.log('  - Fragmented:', info.isFragmented);
				console.log('  - Tracks:', info.tracks.length);
				
				const videoTrack = info.tracks.find((t) => t.type === 'video');
				if (!videoTrack) {
					console.error('[Tracer] mp4box.onReady: FATAL - No video track found in the file.');
					console.log('[Tracer] mp4box.onReady: Available tracks:', info.tracks.map(t => ({ id: t.id, type: t.type, codec: t.codec })));
					return;
				}
				
				console.log('[Tracer] mp4box.onReady: Video track validation:');
				console.log('  - Track ID:', videoTrack.id);
				console.log('  - Codec:', videoTrack.codec);
				console.log('  - Resolution:', videoTrack.track_width, 'x', videoTrack.track_height);
				console.log('  - Bitrate:', videoTrack.bitrate);
				console.log('  - Duration:', videoTrack.duration, 'samples');
				console.log('  - Timescale:', videoTrack.timescale);
				
				// Check for H.264 specific requirements
				if (videoTrack.codec.startsWith('avc1')) {
					console.log('[Tracer] mp4box.onReady: H.264 codec detected - avcC description required for WebCodecs.');
				}

				videoDecoder = new VideoDecoder({
					output: (frame) => {
						console.log('[Tracer] videoDecoder.output: Frame received, updating texture. Timestamp:', frame.timestamp, 'Dimensions:', frame.codedWidth, 'x', frame.codedHeight);
						
						if (texture) {
							// Close the previous frame if it exists
							if (texture.image && texture.image.close) {
								texture.image.close();
							}
							
							// Update texture with new frame
							texture.image = frame;
							texture.needsUpdate = true;
							
							// For VideoFrame textures, we need to use VideoTexture instead of CanvasTexture
							if (frame.codedWidth && frame.codedHeight) {
								// Create a new VideoTexture if this is the first frame or dimensions changed
								if (!texture.isVideoTexture || 
									texture.image.codedWidth !== frame.codedWidth || 
									texture.image.codedHeight !== frame.codedHeight) {
									
									console.log('[Tracer] videoDecoder.output: Creating VideoTexture for frame dimensions:', frame.codedWidth, 'x', frame.codedHeight);
									
									// Create a new VideoTexture optimized for VideoFrame
									const newTexture = new THREE.VideoTexture(frame);
									newTexture.needsUpdate = true;
									
									// Update the material uniform
									material.uniforms.u_texture.value = newTexture;
									
									// Clean up old texture
									if (texture.image && texture.image.close) {
										texture.image.close();
									}
									texture.dispose();
									texture = newTexture;
								}
								
								handleResize();
							}
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

				// For H.264/AVC, the description is required. Extract avcC from MP4Box.
				if (videoTrack.codec.startsWith('avc1')) {
					console.log('[Tracer] mp4box.onReady: H.264 codec detected, extracting avcC description.');
					
					try {
						// Method 1: Use MP4Box's getTrackById to access the full track structure
						const fullTrack = mp4boxfile.getTrackById(videoTrack.id);
						console.log('[Tracer] mp4box.onReady: Full track structure:', fullTrack);
						
						// Navigate to the avcC box in the track's sample description
						if (fullTrack?.mdia?.minf?.stbl?.stsd?.entries?.[0]) {
							const sampleEntry = fullTrack.mdia.minf.stbl.stsd.entries[0];
							console.log('[Tracer] mp4box.onReady: Sample entry:', sampleEntry);
							
							// Look for avcC box in the sample entry
							if (sampleEntry.avcC) {
								console.log('[Tracer] mp4box.onReady: Found avcC box:', sampleEntry.avcC);
								console.log('[Tracer] mp4box.onReady: avcC box properties:', Object.keys(sampleEntry.avcC));
								
								// Try different ways to extract the avcC data
								// Method 1: Direct data property
								if (sampleEntry.avcC.data) {
									config.description = sampleEntry.avcC.data;
									console.log('[Tracer] mp4box.onReady: Using avcC.data, length:', config.description.byteLength);
								}
								// Method 2: Check if it's an ArrayBuffer directly
								else if (sampleEntry.avcC instanceof ArrayBuffer) {
									config.description = sampleEntry.avcC;
									console.log('[Tracer] mp4box.onReady: Using avcC as ArrayBuffer, length:', config.description.byteLength);
								}
								// Method 3: Check if it's a Uint8Array
								else if (sampleEntry.avcC instanceof Uint8Array) {
									config.description = sampleEntry.avcC.buffer;
									console.log('[Tracer] mp4box.onReady: Using avcC as Uint8Array buffer, length:', config.description.byteLength);
								}
								// Method 4: Try to serialize the avcC box using MP4Box methods
								else if (sampleEntry.avcC.write) {
									try {
										// Create a stream to write the avcC box data
										const stream = new MP4Box.DataStream();
										stream.endianness = MP4Box.DataStream.BIG_ENDIAN;
										sampleEntry.avcC.write(stream);
										
										// The avcC data starts after the box header (8 bytes: 4 bytes size + 4 bytes type)
										// But we need only the configuration data, not the box wrapper
										const fullBoxData = new Uint8Array(stream.buffer);
										console.log('[Tracer] mp4box.onReady: Full avcC box data length:', fullBoxData.length);
										console.log('[Tracer] mp4box.onReady: First 16 bytes of avcC box:', Array.from(fullBoxData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));
										
										// Skip the box header (8 bytes) to get the raw avcC configuration
										const avcCConfig = fullBoxData.slice(8);
										config.description = avcCConfig.buffer;
										console.log('[Tracer] mp4box.onReady: Extracted avcC config data, length:', config.description.byteLength);
										console.log('[Tracer] mp4box.onReady: avcC config start:', Array.from(avcCConfig.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join(' '));
									} catch (e) {
										console.log('[Tracer] mp4box.onReady: avcC write method failed:', e);
									}
								}
								// Method 5: Try to access configuration data directly
								else if (sampleEntry.avcC.config) {
									config.description = sampleEntry.avcC.config;
									console.log('[Tracer] mp4box.onReady: Using avcC.config, length:', config.description.byteLength || config.description.length);
								}
								// Method 6: Build avcC manually from available properties
								else {
									console.log('[Tracer] mp4box.onReady: Attempting to build avcC from properties...');
									console.log('[Tracer] mp4box.onReady: avcC properties:', {
										configurationVersion: sampleEntry.avcC.configurationVersion,
										profile: sampleEntry.avcC.AVCProfileIndication,
										compatibility: sampleEntry.avcC.profile_compatibility,
										level: sampleEntry.avcC.AVCLevelIndication,
										lengthSizeMinusOne: sampleEntry.avcC.lengthSizeMinusOne,
										nb_SPS: sampleEntry.avcC.nb_SPS,
										nb_PPS: sampleEntry.avcC.nb_PPS
									});
									
									// If we have SPS/PPS data, we can build the avcC
									if (sampleEntry.avcC.SPS && sampleEntry.avcC.PPS) {
										console.log('[Tracer] mp4box.onReady: Building avcC from SPS/PPS data');
										// This would require manual avcC construction - complex but possible
									}
								}
							}
							
							// Alternative: Look for 'boxes' array containing avcC
							if (!config.description && sampleEntry.boxes) {
								const avcCBox = sampleEntry.boxes.find(box => box.type === 'avcC');
								if (avcCBox && avcCBox.data) {
									config.description = avcCBox.data;
									console.log('[Tracer] mp4box.onReady: Found avcC in boxes array, length:', config.description.byteLength);
								}
							}
						}
						
						// Method 2: Try MP4Box file methods if available
						if (!config.description) {
							console.log('[Tracer] mp4box.onReady: Trying MP4Box file methods...');
							
							// Try the moov.trak.mdia.minf.stbl.stsd path directly
							if (mp4boxfile.moov && mp4boxfile.moov.traks) {
								const trak = mp4boxfile.moov.traks.find(t => t.tkhd && t.tkhd.track_id === videoTrack.id);
								if (trak && trak.mdia && trak.mdia.minf && trak.mdia.minf.stbl && trak.mdia.minf.stbl.stsd) {
									const stsd = trak.mdia.minf.stbl.stsd;
									if (stsd.entries && stsd.entries.length > 0) {
										const entry = stsd.entries[0];
										console.log('[Tracer] mp4box.onReady: Direct moov access - entry:', entry);
										
										if (entry.avcC && entry.avcC.write) {
											try {
												const stream = new MP4Box.DataStream();
												stream.endianness = MP4Box.DataStream.BIG_ENDIAN;
												entry.avcC.write(stream);
												
												const fullData = new Uint8Array(stream.buffer);
												const configData = fullData.slice(8); // Skip box header
												config.description = configData.buffer;
												console.log('[Tracer] mp4box.onReady: Direct moov avcC extracted, length:', config.description.byteLength);
											} catch (e) {
												console.log('[Tracer] mp4box.onReady: Direct moov avcC write failed:', e);
											}
										}
									}
								}
							}
							
							// Try getSampleDescription if available
							if (!config.description && typeof mp4boxfile.getSampleDescription === 'function') {
								try {
									const sampleDesc = mp4boxfile.getSampleDescription(videoTrack.id, 0);
									console.log('[Tracer] mp4box.onReady: Sample description:', sampleDesc);
									
									if (sampleDesc?.avcC) {
										config.description = sampleDesc.avcC.data || sampleDesc.avcC;
										console.log('[Tracer] mp4box.onReady: Got avcC from getSampleDescription');
									}
								} catch (e) {
									console.log('[Tracer] mp4box.onReady: getSampleDescription failed:', e);
								}
							}
							
							// Try getCodecDescription if available
							if (!config.description && typeof mp4boxfile.getCodecDescription === 'function') {
								try {
									const codecDesc = mp4boxfile.getCodecDescription(videoTrack.id);
									if (codecDesc) {
										config.description = codecDesc;
										console.log('[Tracer] mp4box.onReady: Got description from getCodecDescription');
									}
								} catch (e) {
									console.log('[Tracer] mp4box.onReady: getCodecDescription failed:', e);
								}
							}
						}
						
						// Method 3: Check if info.tracks has the codec description
						if (!config.description && info.tracks) {
							const infoTrack = info.tracks.find(t => t.id === videoTrack.id);
							if (infoTrack) {
								console.log('[Tracer] mp4box.onReady: Checking info track:', infoTrack);
								
								if (infoTrack.codec_private) {
									config.description = infoTrack.codec_private;
									console.log('[Tracer] mp4box.onReady: Using codec_private from info track');
								}
							}
						}
						
					} catch (e) {
						console.log('[Tracer] mp4box.onReady: Error extracting avcC:', e);
					}
					
					// Final validation
					if (!config.description) {
						console.error('[Tracer] mp4box.onReady: CRITICAL - No avcC description found for H.264 codec. Video decoding will fail.');
						console.log('[Tracer] mp4box.onReady: Available MP4Box methods:', Object.getOwnPropertyNames(mp4boxfile));
						
						// Log the full info structure for debugging
						console.log('[Tracer] mp4box.onReady: Full MP4Box info for debugging:', info);
					} else {
						console.log('[Tracer] mp4box.onReady: ✓ Successfully extracted avcC description, length:', config.description.byteLength || config.description.length);
						console.log('[Tracer] mp4box.onReady: avcC type:', typeof config.description);
						console.log('[Tracer] mp4box.onReady: avcC constructor:', config.description.constructor.name);
					}
				}

				console.log('[Tracer] mp4box.onReady: Configuring decoder with:', config);
				videoDecoder.configure(config);

				mp4boxfile.setExtractionOptions(videoTrack.id, null, { nbSamples: 1000 });
				mp4boxfile.start();
				console.log('[Tracer] mp4box.onReady: Extraction started.');
			};

			mp4boxfile.onSamples = (track_id, user, samples) => {
				console.log(`[Tracer] mp4box.onSamples: Received ${samples.length} samples for track ${track_id}.`);
				for (const sample of samples) {
					const chunk = new EncodedVideoChunk({
						type: sample.is_sync ? 'key' : 'delta',
						timestamp: sample.cts,
						duration: sample.duration,
						data: sample.data
					});
					console.log(`[Tracer] mp4box.onSamples: Processing sample - type: ${chunk.type}, timestamp: ${chunk.timestamp}, data size: ${sample.data.byteLength}`);
					if (videoDecoder.state === 'configured') {
						videoDecoder.decode(chunk);
					} else {
						console.warn(`[Tracer] mp4box.onSamples: Decoder not configured, state: ${videoDecoder.state}`);
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
