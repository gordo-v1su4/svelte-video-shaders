<script>
	import { onDestroy, onMount } from 'svelte';
	import * as MP4Box from 'mp4box';
	import * as THREE from 'three';

	let {
		file = null,
		fragmentShader = '',
		uniforms = {},
		shouldLoop = true
	} = $props();

	// Internal state
	let canvas;
	let showOverlay = $state(true);
	// Video playback timing control
	let isPlaying = $state(false);
	let playbackStartTime = 0;
	let videoStartTime = 0;
	let frameQueue = [];
	let maxQueueSize = 10; // Reduced buffer size to prevent bottlenecks
	let playbackTimer = null;

	// three.js state
	let renderer, scene, camera, material, texture, mesh;
	let animationFrameId;

	// WebCodecs state
	let videoDecoder;
	let mp4boxfile;
	let queueSize = 0;
	const MAX_QUEUE_SIZE = 10; // Prevent decoder overload
	let pendingSamples = []; // Store samples waiting to be processed
	let isProcessingSamples = false;
	let videoTrack = null; // Store video track info for aspect ratio
	
	// Simplified frame control
	let targetFrameRate = $state(24);
	let currentFrame = $state(null);
	let currentTime = $state(0);
	let duration = $state(0);
	let lastFrameTime = 0;
	let frameInterval = 1000 / 24; // Default 24fps interval

	// Frame rate tracking
	let actualFrameRate = $state(0);
	let lastFpsUpdate = 0;
	let lastVideoTime = 0;
	let videoFrameCount = 0;

	let fileInput;

	/**
	 * Extract H.264 AVCDecoderConfigurationRecord from track data.
	 * According to W3C WebCodecs AVC registration: https://www.w3.org/TR/webcodecs-avc-codec-registration/
	 * For 'avc' format (MP4), the description field must contain an AVCDecoderConfigurationRecord.
	 * @param {object} track - The video track object from mp4box.js.
	 * @returns {Uint8Array | null} The avcC data buffer or null if not found.
	 */
	function getAvccDescription(track) {
		console.log('[Player] Extracting H.264 description for avc format (W3C spec compliant)');
		console.log('[Player] Track structure:', track);
		console.log('[Player] Track keys:', Object.keys(track));
		
		// Try to access SPS/PPS directly from track properties first
		let sps = null;
		let pps = null;
		
		// Method 1: Check track.sps and track.pps (common in MP4Box.js)
		if (track.sps && track.pps) {
			console.log('[Player] Found SPS/PPS directly in track');
			sps = track.sps;
			pps = track.pps;
		}
		
		// Method 2: Check track.avcC.SPS/PPS
		else if (track.avcC?.SPS && track.avcC?.PPS) {
			console.log('[Player] Found SPS/PPS in track.avcC');
			sps = track.avcC.SPS;
			pps = track.avcC.PPS;
		}
		
		// Method 3: Check for pre-built avcC data
		else if (track.avcC && track.avcC instanceof Uint8Array) {
			console.log('[Player] Found pre-built avcC data');
			return track.avcC;
		}
		
		// Method 4: Check description entries for avcC box
		else if (track.description?.entries) {
			console.log('[Player] Checking description entries for avcC box');
			for (const entry of track.description.entries) {
				const avccBox = entry.boxes?.find(b => b.type === 'avcC');
				if (avccBox?.data) {
					console.log('[Player] Found avcC box in description entries');
					return avccBox.data;
				}
			}
		}
		
		// Method 5: Extract from MP4 box structure using getTrackById
		else {
			console.log('[Player] Attempting to extract avcC from MP4 box structure');
			const detailedTrack = mp4boxfile.getTrackById(track.id);
			if (detailedTrack) {
				console.log('[Player] Detailed track found:', detailedTrack);
				console.log('[Player] Detailed track type:', detailedTrack.constructor.name);
				
				// Navigate through MP4 box structure: Track -> Media -> MediaInfo -> SampleTable -> SampleDescription
				if (detailedTrack.mdia && detailedTrack.mdia.minf && detailedTrack.mdia.minf.stbl && detailedTrack.mdia.minf.stbl.stsd) {
					console.log('[Player] Found sample description table (stsd)');
					const stsd = detailedTrack.mdia.minf.stbl.stsd;
					console.log('[Player] stsd structure:', stsd);
					console.log('[Player] stsd entries:', stsd.entries);
					
					if (stsd.entries && stsd.entries.length > 0) {
						const entry = stsd.entries[0]; // First (and usually only) entry
						console.log('[Player] Sample description entry:', entry);
						console.log('[Player] Entry type:', entry.type);
						console.log('[Player] Entry keys:', Object.keys(entry));
						
						// Look for avcC box in the sample description entry
						if (entry.avcC) {
							console.log('[Player] Found avcC in sample description entry');
							console.log('[Player] entry.avcC structure:', entry.avcC);
							console.log('[Player] entry.avcC keys:', Object.keys(entry.avcC));
							
							// First priority: Use pre-built avcC data if available and valid
							if (entry.avcC.data && entry.avcC.data.length > 10) {
								console.log('[Player] Checking pre-built avcC data, length:', entry.avcC.data.length);
								console.log('[Player] avcC data first 20 bytes:', Array.from(entry.avcC.data.slice(0, 20)));
								
								// Validate the avcC data structure
								if (entry.avcC.data[0] === 1) { // configurationVersion should be 1
									console.log('[Player] Pre-built avcC data appears valid, using it');
									return entry.avcC.data;
								} else {
									console.warn('[Player] Pre-built avcC data has invalid configurationVersion:', entry.avcC.data[0]);
								}
							}
							
							// Second priority: Extract and validate SPS/PPS from avcC structure
							if (entry.avcC.SPS && entry.avcC.PPS) {
								console.log('[Player] Found SPS/PPS in entry.avcC, validating...');
								console.log('[Player] SPS structure:', entry.avcC.SPS);
								console.log('[Player] PPS structure:', entry.avcC.PPS);
								console.log('[Player] SPS type:', typeof entry.avcC.SPS);
								console.log('[Player] PPS type:', typeof entry.avcC.PPS);
								console.log('[Player] SPS is array:', Array.isArray(entry.avcC.SPS));
								console.log('[Player] PPS is array:', Array.isArray(entry.avcC.PPS));
								
								// Extract the actual SPS/PPS data
								let spsData = null;
								let ppsData = null;
								
								// Handle different possible structures
								if (Array.isArray(entry.avcC.SPS) && entry.avcC.SPS.length > 0) {
									if (entry.avcC.SPS[0].data) {
										spsData = new Uint8Array(entry.avcC.SPS[0].data);
									} else if (entry.avcC.SPS[0] instanceof Uint8Array) {
										spsData = entry.avcC.SPS[0];
									} else {
										spsData = new Uint8Array(entry.avcC.SPS[0]);
									}
								} else if (entry.avcC.SPS.data) {
									spsData = new Uint8Array(entry.avcC.SPS.data);
								} else if (entry.avcC.SPS instanceof Uint8Array) {
									spsData = entry.avcC.SPS;
								}
								
								if (Array.isArray(entry.avcC.PPS) && entry.avcC.PPS.length > 0) {
									if (entry.avcC.PPS[0].data) {
										ppsData = new Uint8Array(entry.avcC.PPS[0].data);
									} else if (entry.avcC.PPS[0] instanceof Uint8Array) {
										ppsData = entry.avcC.PPS[0];
									} else {
										ppsData = new Uint8Array(entry.avcC.PPS[0]);
									}
								} else if (entry.avcC.PPS.data) {
									ppsData = new Uint8Array(entry.avcC.PPS.data);
								} else if (entry.avcC.PPS instanceof Uint8Array) {
									ppsData = entry.avcC.PPS;
								}
								
								if (spsData && ppsData) {
									console.log('[Player] Extracted SPS length:', spsData.length, 'first bytes:', Array.from(spsData.slice(0, 10)));
									console.log('[Player] Extracted PPS length:', ppsData.length, 'first bytes:', Array.from(ppsData.slice(0, 10)));
									
									// Validate NAL unit types
									const spsNalType = spsData[0] & 0x1f;
									const ppsNalType = ppsData[0] & 0x1f;
									
									if (spsNalType === 0x07 && ppsNalType === 0x08) {
										console.log('[Player] SPS/PPS NAL types are valid, constructing AVCDecoderConfigurationRecord');
										return constructAvccFromValidSPS_PPS(spsData, ppsData);
									} else {
										console.error('[Player] Invalid NAL types - SPS:', spsNalType, '(expected 7), PPS:', ppsNalType, '(expected 8)');
										console.error('[Player] SPS first byte: 0x' + spsData[0].toString(16));
										console.error('[Player] PPS first byte: 0x' + ppsData[0].toString(16));
									}
								}
							}
							
							// Third priority: Try to extract from raw avcC box data
							if (entry.avcC.size && entry.avcC.size > 10) {
								console.log('[Player] Attempting to parse raw avcC box data');
								return parseRawAvccBox(entry.avcC);
							}
						}
						
						// Check for boxes array in the entry
						if (entry.boxes) {
							console.log('[Player] Checking entry.boxes for avcC');
							for (const box of entry.boxes) {
								if (box.type === 'avcC') {
									console.log('[Player] Found avcC box in entry.boxes');
									if (box.data) {
										return box.data;
									}
									if (box.SPS && box.PPS) {
										sps = box.SPS;
										pps = box.PPS;
										break;
									}
								}
							}
						}
					}
				}
			}
		}
		
		// If we found SPS/PPS, construct the AVCDecoderConfigurationRecord
		if (sps && pps) {
			console.log('[Player] Constructing AVCDecoderConfigurationRecord from SPS/PPS');
			console.log('[Player] SPS length:', sps.length, 'PPS length:', pps.length);
			console.log('[Player] Raw SPS:', sps);
			console.log('[Player] Raw PPS:', pps);
			
			// Construct AVCDecoderConfigurationRecord according to ISO/IEC 14496-15
			// Based on the W3C WebCodecs AVC registration specification
			const spsArray = Array.isArray(sps) ? sps : [sps];
			const ppsArray = Array.isArray(pps) ? pps : [pps];
			
			console.log('[Player] SPS array length:', spsArray.length);
			console.log('[Player] PPS array length:', ppsArray.length);
			console.log('[Player] First SPS:', spsArray[0]);
			console.log('[Player] First PPS:', ppsArray[0]);
			console.log('[Player] First SPS type:', typeof spsArray[0]);
			console.log('[Player] First PPS type:', typeof ppsArray[0]);
			
			// Check if SPS/PPS are Uint8Arrays or need conversion
			const spsData = spsArray[0] instanceof Uint8Array ? spsArray[0] : new Uint8Array(spsArray[0]);
			const ppsData = ppsArray[0] instanceof Uint8Array ? ppsArray[0] : new Uint8Array(ppsArray[0]);
			
			console.log('[Player] Converted SPS length:', spsData.length);
			console.log('[Player] Converted PPS length:', ppsData.length);
			console.log('[Player] SPS first 10 bytes:', Array.from(spsData.slice(0, 10)));
			console.log('[Player] PPS first 10 bytes:', Array.from(ppsData.slice(0, 10)));
			
			// Validate SPS/PPS NAL units
			if (spsData.length < 4) {
				console.error('[Player] Invalid SPS: too short (< 4 bytes)');
				return null;
			}
			if (ppsData.length < 4) {
				console.error('[Player] Invalid PPS: too short (< 4 bytes)');
				return null;
			}
			
			// Check SPS NAL unit type (should be 0x67 for SPS)
			const spsNalType = spsData[0] & 0x1f;
			if (spsNalType !== 0x07) { // 0x67 & 0x1f = 0x07
				console.warn('[Player] Warning: SPS NAL type is', spsNalType, 'expected 7 (0x07)');
				console.warn('[Player] First SPS byte:', '0x' + spsData[0].toString(16));
			}
			
			// Check PPS NAL unit type (should be 0x68 for PPS)  
			const ppsNalType = ppsData[0] & 0x1f;
			if (ppsNalType !== 0x08) { // 0x68 & 0x1f = 0x08
				console.warn('[Player] Warning: PPS NAL type is', ppsNalType, 'expected 8 (0x08)');
				console.warn('[Player] First PPS byte:', '0x' + ppsData[0].toString(16));
			}
			
			// Calculate total size needed
			let totalSize = 7; // Basic header (6 bytes) + SPS count (1 byte)
			totalSize += 2 + spsData.length; // 2 bytes length + SPS data
			totalSize += 1; // PPS count (1 byte)
			totalSize += 2 + ppsData.length; // 2 bytes length + PPS data
			
			console.log('[Player] Total AVCDecoderConfigurationRecord size will be:', totalSize);
			
			const description = new Uint8Array(totalSize);
			let offset = 0;
			
			// AVC configuration header
			description[offset++] = 1; // configurationVersion
			description[offset++] = spsData[1]; // AVCProfileIndication (from SPS)
			description[offset++] = spsData[2]; // profile_compatibility (from SPS)
			description[offset++] = spsData[3]; // AVCLevelIndication (from SPS)
			description[offset++] = 0xff; // lengthSizeMinusOne (4 bytes - 1 = 3, with reserved bits)
			description[offset++] = 0xe0 | 1; // SPS count with reserved bits (hardcoded to 1 for now)
			
			// Add SPS data
			description[offset++] = (spsData.length >> 8) & 0xff; // SPS length high byte
			description[offset++] = spsData.length & 0xff; // SPS length low byte
			description.set(spsData, offset);
			offset += spsData.length;
			
			// Add PPS count and data
			description[offset++] = 1; // PPS count (hardcoded to 1 for now)
			description[offset++] = (ppsData.length >> 8) & 0xff; // PPS length high byte
			description[offset++] = ppsData.length & 0xff; // PPS length low byte
			description.set(ppsData, offset);
			offset += ppsData.length;
			
			console.log('[Player] Successfully constructed AVCDecoderConfigurationRecord, size:', description.length);
			console.log('[Player] AVCDecoderConfigurationRecord first 20 bytes:', Array.from(description.slice(0, 20)));
			return description;
		}
		
		console.log('[Player] CRITICAL: Cannot find H.264 parameter sets (SPS/PPS) for avc format');
		console.log('[Player] According to W3C spec, avc format requires AVCDecoderConfigurationRecord in description field');
		console.log('[Player] Available track properties:', Object.keys(track));
		
		// Log detailed track inspection for debugging
		if (track.video) {
			console.log('[Player] track.video:', track.video);
			console.log('[Player] track.video keys:', Object.keys(track.video));
		}
		
		return null;
	}

	onMount(() => {
		if (!canvas) {
			console.error('[Player] Canvas element not found on mount.');
			return;
		}

		try {
			renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
			scene = new THREE.Scene();
			camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
			texture = new THREE.VideoTexture(document.createElement('video'));
			material = new THREE.ShaderMaterial({
				uniforms: { u_texture: { value: texture }, ...uniforms },
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
			// Create plane geometry for video
			const geometry = new THREE.PlaneGeometry(2, 2); // Will be resized when video loads
			mesh = new THREE.Mesh(geometry, material);
			scene.add(mesh);
			handleResize();
			window.addEventListener('resize', handleResize);
			render();
		} catch (e) {
			console.error('[Player] Error during Three.js initialization.', e);
		}

		return () => {
			window.removeEventListener('resize', handleResize);
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
			if (texture) {
				if (texture.image?.close) texture.image.close();
				texture.dispose();
			}
			if (videoDecoder?.state !== 'closed') videoDecoder.close();
			if(mp4boxfile) mp4boxfile.stop();
			if(renderer) renderer.dispose();
		};
	});

	onDestroy(() => {
		window.removeEventListener('resize', handleResize);
		cancelAnimationFrame(animationFrameId);
		
		// Clean up playback timer
		if (playbackTimer) {
			clearTimeout(playbackTimer);
		}
		
		// Clean up frame queue
		frameQueue.forEach(item => {
			if (item.frame && typeof item.frame.close === 'function') {
				item.frame.close();
			}
		});
		frameQueue = [];
		
		// Clean up video resources
		if (currentFrame && typeof currentFrame.close === 'function') {
			currentFrame.close();
		}
		
		if (renderer) renderer.dispose();
		if (videoDecoder) {
			try {
				videoDecoder.close();
			} catch (e) {
				console.error('[Player] Error closing decoder:', e);
			}
		}
		if (mp4boxfile) {
			try {
				mp4boxfile.stop();
			} catch (e) {
				console.error('[Player] Error stopping MP4Box:', e);
			}
		}
	});

	function handleResize() {
		if (!renderer || !camera || !canvas) return;

		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		
		renderer.setSize(width, height);
		
		// Calculate aspect ratios
		const canvasAspect = width / height;
		let videoAspect = 16/9; // Default to 16:9
		
		// Get video dimensions from track
		if (videoTrack) {
			videoAspect = videoTrack.track_width / videoTrack.track_height;
			console.log('[Player] Video aspect ratio:', videoAspect, `(${videoTrack.track_width}x${videoTrack.track_height})`);
		}
		
		console.log('[Player] Canvas aspect ratio:', canvasAspect, `(${width}x${height})`);
		
		// Set video display size to 3/4 scale (960x540 for 1280x720 video)
		const scale = 0.75;
		let videoDisplayWidth, videoDisplayHeight;
		
		if (videoTrack) {
			videoDisplayWidth = videoTrack.track_width * scale;
			videoDisplayHeight = videoTrack.track_height * scale;
		} else {
			// Default to 960x540 (3/4 of 1280x720)
			videoDisplayWidth = 960;
			videoDisplayHeight = 540;
		}
		
		console.log('[Player] Video display size:', `${videoDisplayWidth}x${videoDisplayHeight}`);
		
		// Center the video in the canvas
		camera.left = -width / 2;
		camera.right = width / 2;
		camera.top = height / 2;
		camera.bottom = -height / 2;
		camera.updateProjectionMatrix();
		
		// Update geometry to match the 1/4 scale video size
		if (mesh && mesh.geometry) {
			mesh.geometry.dispose(); // Clean up old geometry
			mesh.geometry = new THREE.PlaneGeometry(videoDisplayWidth, videoDisplayHeight);
		}
		
		console.log('[Player] Camera bounds:', { 
			left: camera.left, 
			right: camera.right, 
			top: camera.top, 
			bottom: camera.bottom,
			videoDisplayWidth,
			videoDisplayHeight,
			scale
		});
	}

	function render() {
		if (renderer) {
			renderer.render(scene, camera);
			animationFrameId = requestAnimationFrame(render);
		}
	}





	/**
	 * Handle decoded video frame and update texture
	 */
	function onVideoFrame(frame) {
		if (!mesh || !mesh.material.uniforms.u_texture.value) return;
		
		// Update frame rate counter based on actual frame display timing
		const now = performance.now();
		
		if (lastFpsUpdate === 0) {
			lastFpsUpdate = now;
			videoFrameCount = 0;
		} else if (now - lastFpsUpdate >= 1000) { // Update every second
			actualFrameRate = videoFrameCount;
			videoFrameCount = 0;
			lastFpsUpdate = now;
		}
		
		videoFrameCount++;
		
		// Update texture
		mesh.material.uniforms.u_texture.value.image = frame;
		mesh.material.uniforms.u_texture.value.needsUpdate = true;
	}

	/**
	 * Start timed frame playback
	 */
	function startFramePlayback() {
		if (playbackTimer || frameQueue.length === 0) return;
		
		playbackStartTime = performance.now();
		videoStartTime = frameQueue[0].timestamp;
		
		console.log('[Player] Starting frame playback, first frame at:', videoStartTime);
		console.log('[Player] Target frame rate:', targetFrameRate, 'fps');
		console.log('[Player] Frame interval:', frameInterval, 'ms');
		
		function playNextFrame() {
			if (frameQueue.length === 0) {
				// Check if we've reached the end and should loop
				if (shouldLoop && currentTime >= duration - 0.1) { // Small buffer for end detection
					console.log('[Player] Video ended, looping...');
					restart();
					return;
				}
				playbackTimer = null;
				return;
			}
			
			// Get the next frame from the queue
			const frameData = frameQueue.shift();
			
			if (frameData) {
				// Close previous frame
				if (currentFrame && typeof currentFrame.close === 'function') {
					currentFrame.close();
				}
				
				// Display the frame
				currentFrame = frameData.frame;
				currentTime = frameData.timestamp;
				onVideoFrame(frameData.frame);
				
				console.log('[Player] Displaying frame at time:', frameData.timestamp.toFixed(3), 's');
			}
			
			// Schedule next frame based on target frame rate
			if (frameQueue.length > 0) {
				playbackTimer = setTimeout(playNextFrame, frameInterval);
			} else {
				playbackTimer = null;
			}
		}
		
		// Start with the first frame immediately
		playNextFrame();
	}

	async function start() {
		if (!canvas || !renderer || !scene || !camera || !mesh) {
			console.warn('[Player] Not initialized');
			return;
		}
		showOverlay = false;
		isPlaying = true;

		if (!window.VideoDecoder) {
			console.error('[Player] FATAL - WebCodecs API not supported.');
			return;
		}

		try {
			// --- TEMPORARY TEST: Use a known-good remote video file ---
			console.log('[Player] Checking for uploaded file');
			let src;
			let useLocalFile = false;
			if (file) {
				src = URL.createObjectURL(file);
				console.log('[Player] Using uploaded file from props', src, 'File name:', file.name);
				useLocalFile = true;
			} else if (fileInput && fileInput.files && fileInput.files[0]) {
				src = URL.createObjectURL(fileInput.files[0]);
				console.log('[Player] Using uploaded file from input', src, 'File name:', fileInput.files[0].name);
				useLocalFile = true;
			} else {
				src = 'https://www.w3schools.com/html/mov_bbb.mp4';
				console.log('[Player] Using fallback test video', src);
			}

			const response = await fetch(src);
			if (!response.ok) {
				throw new Error(`Failed to fetch video: ${response.statusText}`);
			}
			console.log('[Player] Video fetch successful, processing stream');

			const reader = response.body.getReader();
			let offset = 0;

			mp4boxfile = MP4Box.createFile();
			console.log('[Player] MP4Box file created');

			mp4boxfile.onReady = (info) => {
				console.log('[Player] MP4Box ready', info);
				
				// Find video track
				const track = info.videoTracks[0];
				if (!track) {
					console.error('[Player] No video track found');
					return;
				}
				
				// Store track info for aspect ratio calculations
				videoTrack = track;
				
				// Calculate frame rate
				const frameRate = track.nb_samples / (track.movie_duration / track.movie_timescale);
				targetFrameRate = frameRate;
				frameInterval = 1000 / frameRate; // Update frame interval
				console.log('[Player] Calculated frame rate:', frameRate.toFixed(2), 'fps');
				console.log('[Player] Frame interval:', frameInterval.toFixed(2), 'ms');
				
				// Calculate duration in seconds
				if (track.movie_duration && track.movie_timescale) {
					duration = track.movie_duration / track.movie_timescale;
					console.log('[Player] Video duration:', duration.toFixed(2), 'seconds');
				}
				
				console.log('[Player] Video track:', track);
				
				// Enhanced debugging for H.264 parameter sets
				console.log('[Player] Detailed track inspection:');
				console.log('[Player] - track.id:', track.id);
				console.log('[Player] - track.codec:', track.codec);
				console.log('[Player] - track.track_width:', track.track_width);
				console.log('[Player] - track.track_height:', track.track_height);
				
				// Check for SPS/PPS in various possible locations
				console.log('[Player] Checking for H.264 parameter sets:');
				console.log('[Player] - track.sps:', track.sps ? 'present' : 'missing');
				console.log('[Player] - track.pps:', track.pps ? 'present' : 'missing');
				console.log('[Player] - track.avcC:', track.avcC ? 'present' : 'missing');
				
				// Try to get track by ID to see if it has more detailed info
				const detailedTrack = mp4boxfile.getTrackById(track.id);
				if (detailedTrack && detailedTrack !== track) {
					console.log('[Player] Detailed track from getTrackById:', detailedTrack);
					console.log('[Player] Detailed track keys:', Object.keys(detailedTrack));
				}

				// Check codec support
				if (!VideoDecoder.isConfigSupported({ codec: track.codec })) {
					console.error('[Player] Codec not supported:', track.codec);
					useFallback = true;
					return;
				}

				// Extract H.264 description for avc format
				let description = null;
				if (track.codec.startsWith('avc1') || track.codec.startsWith('avc3')) {
					description = getAvccDescription(track);
					
					// If we couldn't get the description synchronously, try the async method
					if (!description) {
						console.warn('[Player] Could not find H.264 description, may cause decoding issues');
						initializeDecoder(track, null);
					} else {
						initializeDecoder(track, description);
					}
				}
			};

			mp4boxfile.onSamples = (track_id, ref, samples) => {
				console.log('[Player] onSamples called', { track_id, samples_length: samples.length });
				
				// Sort samples by decode order (DTS) - critical for WebCodecs
				samples.sort((a, b) => a.dts - b.dts);
				console.log('[Player] Samples sorted by DTS for decode order');
				
				// Add to pending samples queue
				pendingSamples.push(...samples);
				console.log('[Player] Added', samples.length, 'samples to pending queue. Total pending:', pendingSamples.length);
				
				// Start processing if not already processing
				if (!isProcessingSamples) {
					processPendingSamples();
				}
			};
			
			/**
			 * Process pending samples with queue management
			 */
			function processPendingSamples() {
				if (isProcessingSamples || pendingSamples.length === 0) {
					return;
				}
				
				isProcessingSamples = true;
				console.log('[Player] Starting to process', pendingSamples.length, 'pending samples');
				
				function processNextBatch() {
					// Process samples while queue allows
					while (pendingSamples.length > 0 && (!videoDecoder || videoDecoder.decodeQueueSize <= MAX_QUEUE_SIZE)) {
						const sample = pendingSamples.shift();
						const type = sample.is_sync ? 'key' : 'delta';
						
						const chunk = new EncodedVideoChunk({
							type,
							timestamp: sample.dts, // Use DTS for WebCodecs decode order
							duration: sample.duration,
							data: sample.data
						});
						
						if (videoDecoder && videoDecoder.state === 'configured') {
							try {
								videoDecoder.decode(chunk);
								queueSize++;
							} catch (e) {
								console.error('[Player] Error decoding chunk:', e);
								// Continue with other samples
							}
						} else {
							// Re-add sample to front of queue to retry later
							pendingSamples.unshift(sample);
							break;
						}
					}
					
					// Check if we need to wait for queue to clear
					if (pendingSamples.length > 0 && videoDecoder && videoDecoder.decodeQueueSize > MAX_QUEUE_SIZE) {
						console.log('[Player] Queue full, waiting for frames to process. Queue size:', videoDecoder.decodeQueueSize, 'Pending:', pendingSamples.length);
						// Schedule next batch after a delay
						setTimeout(processNextBatch, 50); // 50ms delay
					} else if (pendingSamples.length === 0) {
						console.log('[Player] Finished processing all pending samples');
						
						// Check if we should loop when all samples are processed
						if (shouldLoop && pendingSamples.length === 0) {
							// Wait a bit for remaining frames to play, then restart
							setTimeout(() => {
								if (frameQueue.length === 0 && shouldLoop) {
									console.log('[Player] All samples processed, looping...');
									restart();
								}
							}, frameInterval * 3); // Wait 3 frame intervals
						}
						isProcessingSamples = false;
					} else {
						// Continue processing immediately
						setTimeout(processNextBatch, 0);
					}
				}
				
				processNextBatch();
			}

			function initializeDecoder(track, description) {
				console.log('[Player] Initializing decoder with description:', description ? 'present' : 'missing');
				
				// Create VideoDecoder
				videoDecoder = new VideoDecoder({
					output: (frame) => {
						if (!frame) return;
						
						try {
							queueSize = Math.max(0, queueSize - 1);
							
							// Add frame to playback queue instead of displaying immediately
							if (frameQueue.length < maxQueueSize) {
								frameQueue.push({
									frame: frame,
									timestamp: frame.timestamp / 1000000 // Convert to seconds
								});
								
								console.log('[Player] Frame queued, queue size:', frameQueue.length);
								
								// Start playback if we have enough frames buffered
								if (frameQueue.length >= 3 && !playbackTimer) {
									startFramePlayback();
								}
							} else {
								// Queue is full, drop the frame
								console.log('[Player] Queue full, dropping frame');
								frame.close();
							}
							
							// Resume sample processing if needed
							if (pendingSamples.length > 0 && videoDecoder.decodeQueueSize <= MAX_QUEUE_SIZE && !isProcessingSamples) {
								processPendingSamples();
							}
						} catch (e) {
							console.error('[Player] Error in VideoDecoder output:', e);
							if (frame && typeof frame.close === 'function') {
								frame.close();
							}
						}
					},
					error: (e) => {
						console.error('[Decoder] VideoDecoder error:', e);
						console.error('[Decoder] Error type:', e.constructor.name);
						console.error('[Decoder] Error message:', e.message);
						console.error('[Decoder] Current queue size:', queueSize);
						console.error('[Decoder] Decoder queue size:', videoDecoder?.decodeQueueSize || 0);
						
						// Reset queue counter on error
						queueSize = 0;
						
						// Try to reset decoder on error
						if (videoDecoder && videoDecoder.state !== 'closed') {
							try {
								console.log('[Decoder] Attempting to reset decoder after error');
								videoDecoder.reset();
							} catch (resetError) {
								console.error('[Decoder] Failed to reset decoder:', resetError);
							}
						}
					}
				});
				
				// Configure decoder
				const config = {
					codec: track.codec,
					codedWidth: track.track_width,
					codedHeight: track.track_height
				};
				
				if (description) {
					config.description = description;
					console.log('[Player] Added H.264 description to decoder config');
				}
				
				console.log('[Player] Decoder config:', config);

				try {
					videoDecoder.configure(config);
					console.log('[Player] VideoDecoder successfully configured');
				} catch (e) {
					console.error('[Player] FATAL: VideoDecoder configuration failed:', e);
					console.error('[Player] Config that failed:', config);
					if (config.description) {
						console.error('[Player] Description data:', Array.from(config.description.slice(0, 20)));
						console.error('[Player] Description length:', config.description.length);
					}
					throw e; // Re-throw to prevent further processing
				}

				// Set extraction options
				mp4boxfile.setExtractionOptions(track.id, null, { nbSamples: 100 });
				mp4boxfile.start();
			}

			while(true) {
				const { done, value } = await reader.read();
				if (done) {
					mp4boxfile.flush();
					break;
				}
				const buffer = value.buffer;
				buffer.fileStart = offset;
				offset += buffer.byteLength;
				mp4boxfile.appendBuffer(buffer);
			}
			// --- END TEMPORARY TEST ---

			/*
			// Original file loading logic - temporarily disabled
			const buffer = await file.arrayBuffer();
			buffer.fileStart = 0;
			mp4boxfile.appendBuffer(buffer);
            mp4boxfile.flush();
			*/
		} catch (error) {
			console.error('[Player] FATAL - Failed to start WebCodecs pipeline:', error);
		}
	}

	function handlePlay() {
		play();
	}

	export function play() {
		if (!isPlaying) {
			isPlaying = true;
			showOverlay = false;
			// Start the video pipeline if not already started
			if (!videoDecoder && !mp4boxfile) {
				start();
			} else if (frameQueue.length > 0 && !playbackTimer) {
				startFramePlayback();
			}
		}
	}

	export function pause() {
		isPlaying = false;
		if (playbackTimer) {
			clearTimeout(playbackTimer);
			playbackTimer = null;
		}
	}

	export function togglePlayPause() {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}

	export function restart() {
		console.log('[Player] Restarting video');
		pause();
		
		// Clear frame queue
		frameQueue.forEach(item => {
			if (item.frame && typeof item.frame.close === 'function') {
				item.frame.close();
			}
		});
		frameQueue = [];
		
		// Reset timing
		currentTime = 0;
		playbackStartTime = 0;
		videoStartTime = 0;
		
		// Close current frame
		if (currentFrame && typeof currentFrame.close === 'function') {
			currentFrame.close();
			currentFrame = null;
		}
		
		// Restart the video pipeline
		if (videoDecoder) {
			try {
				videoDecoder.close();
			} catch (e) {
				console.error('[Player] Error closing decoder for restart:', e);
			}
		}
		if (mp4boxfile) {
			try {
				mp4boxfile.stop();
			} catch (e) {
				console.error('[Player] Error stopping MP4Box for restart:', e);
			}
		}
		
		// Reset state
		videoDecoder = null;
		mp4boxfile = null;
		pendingSamples = [];
		isProcessingSamples = false;
		
		// Restart from beginning
		start();
	}

	export function stepFrameForward() {
		console.log('[Player] Step frame forward');
		if (frameQueue.length > 0) {
			// If playing, pause first
			if (isPlaying) {
				pause();
			}
			
			// Display next frame
			const frameData = frameQueue.shift();
			if (frameData) {
				// Close previous frame
				if (currentFrame && typeof currentFrame.close === 'function') {
					currentFrame.close();
				}
				
				// Display the frame
				currentFrame = frameData.frame;
				currentTime = frameData.timestamp;
				onVideoFrame(frameData.frame);
				
				console.log('[Player] Stepped to frame at time:', frameData.timestamp.toFixed(3), 's');
			}
		} else {
			console.log('[Player] No frames available for stepping');
		}
	}

	export function stepFrameBackward() {
		console.log('[Player] Step frame backward');
		// For backward stepping, we need to restart from beginning and play to the previous frame
		// This is a simplified implementation - a full implementation would require frame caching
		const targetTime = Math.max(0, currentTime - (1 / targetFrameRate));
		seekToTime(targetTime);
	}

	export function seekToTime(timeInSeconds) {
		console.log('[Player] Seeking to time:', timeInSeconds);
		const wasPlaying = isPlaying;
		
		// For now, implement seeking by restarting and fast-forwarding
		// A full implementation would require keyframe seeking in MP4Box
		pause();
		
		// Clear frame queue
		frameQueue.forEach(item => {
			if (item.frame && typeof item.frame.close === 'function') {
				item.frame.close();
			}
		});
		frameQueue = [];
		
		// Set target time for seeking
		const targetSeekTime = Math.max(0, Math.min(timeInSeconds, duration));
		currentTime = targetSeekTime;
		
		// For now, just update the current time
		// TODO: Implement proper keyframe seeking with MP4Box
		console.log('[Player] Seek to', targetSeekTime, 's (simplified implementation)');
		
		if (wasPlaying) {
			play();
		}
	}
	
	// Export video control methods and properties
	export { currentTime, duration, targetFrameRate, actualFrameRate };

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
			material.fragmentShader = fragmentShader;
			material.needsUpdate = true;
		}
	});

	/**
	 * Construct AVCDecoderConfigurationRecord from validated SPS/PPS data
	 */
	function constructAvccFromValidSPS_PPS(spsData, ppsData) {
		console.log('[Player] Constructing AVCDecoderConfigurationRecord from validated SPS/PPS');
		
		// Calculate total size: header(6) + SPS count(1) + SPS length(2) + SPS + PPS count(1) + PPS length(2) + PPS
		const totalSize = 6 + 1 + 2 + spsData.length + 1 + 2 + ppsData.length;
		const description = new Uint8Array(totalSize);
		let offset = 0;
		
		// AVC configuration header
		description[offset++] = 1; // configurationVersion
		description[offset++] = spsData[1]; // AVCProfileIndication (from SPS)
		description[offset++] = spsData[2]; // profile_compatibility (from SPS)
		description[offset++] = spsData[3]; // AVCLevelIndication (from SPS)
		description[offset++] = 0xff; // lengthSizeMinusOne (4 bytes - 1 = 3, with reserved bits)
		description[offset++] = 0xe1; // SPS count = 1 with reserved bits (0xe0 | 1)
		
		// Add SPS
		description[offset++] = (spsData.length >> 8) & 0xff; // SPS length high byte
		description[offset++] = spsData.length & 0xff; // SPS length low byte
		description.set(spsData, offset);
		offset += spsData.length;
		
		// Add PPS
		description[offset++] = 1; // PPS count
		description[offset++] = (ppsData.length >> 8) & 0xff; // PPS length high byte
		description[offset++] = ppsData.length & 0xff; // PPS length low byte
		description.set(ppsData, offset);
		
		console.log('[Player] Constructed AVCDecoderConfigurationRecord, size:', description.length);
		console.log('[Player] First 20 bytes:', Array.from(description.slice(0, 20)));
		
		return description;
	}

	/**
	 * Parse raw avcC box data as fallback
	 */
	function parseRawAvccBox(avcCBox) {
		console.log('[Player] Parsing raw avcC box data');
		console.log('[Player] avcC box structure:', avcCBox);
		
		// Try to find the actual data in the box structure
		if (avcCBox.data) {
			console.log('[Player] Found data in avcC box');
			return avcCBox.data;
		}
		
		// If no direct data, try to construct from box properties
		if (avcCBox.AVCProfileIndication && avcCBox.AVCLevelIndication) {
			console.log('[Player] Found profile/level in avcC box, attempting construction');
			// This is a simplified construction - may need adjustment based on actual structure
			const basicConfig = new Uint8Array([
				1, // configurationVersion
				avcCBox.AVCProfileIndication || 0x64,
				avcCBox.profile_compatibility || 0x00,
				avcCBox.AVCLevelIndication || 0x1f,
				0xff, // lengthSizeMinusOne
				0xe1, // SPS count = 1
				0x00, 0x19, // SPS length placeholder
				// SPS data would go here
				0x01, // PPS count = 1
				0x00, 0x06, // PPS length placeholder
				// PPS data would go here
			]);
			
			console.log('[Player] Basic avcC config constructed:', Array.from(basicConfig));
			return basicConfig;
		}
		
		console.error('[Player] Could not parse raw avcC box data');
		return null;
	}

	// Keyboard shortcuts
	function handleKeydown(event) {
		switch (event.key) {
			case ' ':
			case 'k':
				event.preventDefault();
				togglePlayPause();
				break;
			case 'ArrowLeft':
				event.preventDefault();
				stepFrameBackward();
				break;
			case 'ArrowRight':
				event.preventDefault();
				stepFrameForward();
				break;
			case 'Home':
			case '0':
				event.preventDefault();
				restart();
				break;
			case 'p':
				event.preventDefault();
				play();
				break;
			case 'Escape':
				event.preventDefault();
				pause();
				break;
		}
	}

	// Add keyboard event listener
	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div 
	class="player-container" 
	onclick={handlePlay}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handlePlay()}
	role="button"
	tabindex="0"
	aria-label="Video player - click to play"
>
	<canvas bind:this={canvas} class="webgl-canvas"></canvas>
	{#if showOverlay || !isPlaying}
		<div 
			class="play-overlay" 
			onclick={handlePlay}
			onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && handlePlay()}
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
	
	<!-- Frame rate display -->
	<div class="absolute top-2 left-2 bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded z-20">
		Video: {targetFrameRate.toFixed(1)} fps | Playing: {actualFrameRate} fps
	</div>
	
	<!-- Playback status -->
	<div class="absolute top-2 right-2 bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded z-20">
		{isPlaying ? '▶ Playing' : '⏸ Paused'} | {currentTime.toFixed(2)}s / {duration.toFixed(2)}s
	</div>
	
	<!-- Control hints -->
	<div class="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded z-20">
		Space: Play/Pause | ←→: Step | Home: Restart | Esc: Pause
	</div>
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
