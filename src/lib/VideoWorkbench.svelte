<script>
	import * as Tweakpane from 'svelte-tweakpane-ui';
	import { ThemeUtils } from 'svelte-tweakpane-ui';
	import Button from 'svelte-tweakpane-ui/Button.svelte';
import ShaderPlayer from '$lib/ShaderPlayer.svelte';
import PeaksPlayer from '$lib/PeaksPlayer.svelte';
	import { videoAssets, activeVideo } from '$lib/stores.js';
	import { generateThumbnail } from '$lib/video-utils.js';
	import { vhsFragmentShader } from '$lib/shaders/vhs-shader.js';
	import { xlsczNFragmentShader, xlsczNUniforms } from '$lib/shaders/xlsczn-shader.js';
	import { waterFragmentShader, waterUniforms } from '$lib/shaders/water-shader.js';
	import { chromaticAberrationFragmentShader, chromaticAberrationUniforms } from '$lib/shaders/chromatic-aberration-shader.js';
	import { glitchFragmentShader, glitchUniforms } from '$lib/shaders/glitch-shader.js';
	import { noiseFragmentShader, noiseUniforms } from '$lib/shaders/noise-shader.js';
	import { vignetteFragmentShader, vignetteUniforms } from '$lib/shaders/vignette-shader.js';
	import { bloomFragmentShader, bloomUniforms } from '$lib/shaders/bloom-shader.js';
	import { depthOfFieldFragmentShader, depthOfFieldUniforms } from '$lib/shaders/depth-of-field-shader.js';
	import { depthFragmentShader, depthUniforms } from '$lib/shaders/depth-shader.js';
	import { sepiaFragmentShader, sepiaUniforms } from '$lib/shaders/sepia-shader.js';
	import { scanlineFragmentShader, scanlineUniforms } from '$lib/shaders/scanline-shader.js';
	import { pixelationFragmentShader, pixelationUniforms } from '$lib/shaders/pixelation-shader.js';
	import { dotScreenFragmentShader, dotScreenUniforms } from '$lib/shaders/dot-screen-shader.js';
	import { hueSaturationFragmentShader, hueSaturationUniforms } from '$lib/shaders/hue-saturation-shader.js';
	import { brightnessContrastFragmentShader, brightnessContrastUniforms } from '$lib/shaders/brightness-contrast-shader.js';
	import { colorDepthFragmentShader, colorDepthUniforms } from '$lib/shaders/color-depth-shader.js';
	import { colorAverageFragmentShader, colorAverageUniforms } from '$lib/shaders/color-average-shader.js';
	import { tiltShiftFragmentShader, tiltShiftUniforms } from '$lib/shaders/tilt-shift-shader.js';
	import { toneMappingFragmentShader, toneMappingUniforms } from '$lib/shaders/tone-mapping-shader.js';
	import { asciiFragmentShader, asciiUniforms } from '$lib/shaders/ascii-shader.js';
	import { gridFragmentShader, gridUniforms } from '$lib/shaders/grid-shader.js';
	import { lensFlareFragmentShader, lensFlareUniforms } from '$lib/shaders/lens-flare-shader.js';
	import { crtFragmentShader, crtUniforms } from '$lib/shaders/crt-shader.js';
	import { AudioAnalyzer } from '$lib/audio-utils.js';
	import { EssentiaService } from '$lib/essentia-service.js';
	import { parseMIDIFile } from '$lib/midi-utils.js';
	import { frameBuffer } from '$lib/frame-buffer.js';

	// --- Shader State ---
	const shaders = {
		Grayscale: `
			varying vec2 v_uv;
			uniform sampler2D u_texture;
			uniform float u_strength;

			void main() {
				vec4 color = texture2D(u_texture, v_uv);
				float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
				gl_FragColor = vec4(mix(color.rgb, vec3(gray), u_strength), color.a);
			}
		`,
		Vignette: `
			varying vec2 v_uv;
			uniform sampler2D u_texture;
			uniform float u_vignette_strength;
			uniform float u_vignette_falloff;

			void main() {
				vec4 color = texture2D(u_texture, v_uv);
				float dist = distance(v_uv, vec2(0.5));
				float vignette = smoothstep(u_vignette_falloff, u_vignette_strength, dist);
				gl_FragColor = vec4(color.rgb * (1.0 - vignette), color.a);
			}
		`
	};
	let selectedShaderName = $state('VHS');
	let audioAnalyzer = null;
	let essentiaService = null;
	let analysisData = $state({ beats: [], bpm: 0 });
	let isAnalyzingAudio = $state(false);
	let audioFile = $state(null);
	let midiFile = $state(null);
	let midiMarkers = $state([]); // Array of timestamps from MIDI file
	let showMIDIMarkers = $state(true); // Show MIDI markers checkbox
	let showOnsets = $state(true); // Show Essentia onsets checkbox
	let audioVolume = $state(0.5);
	let audioIntensity = $state(1.0);
	let audioColorShift = $state(0.5);
	let audioPulseSpeed = $state(1.0);
	let audioWaveAmplitude = $state(0.5);
	// Removed legacy audioReactivePlayback
	let beatSensitivity = $state(0.3);
	// Removed legacy audioFilterIntensity
	let onsetDensity = $state(1.0); // New state for density control
	let markerSwapThreshold = $state(4); // Swap video after this many markers
	let markerCounter = $state(0); // Current count of markers hit
	let isBeatActive = $state(false); // For visual indicator
	let lastBeatTime = 0; // Debounce for beat detection
	
	let enableLooping = $state(true); // Loop/auto-cycle within playback
	
	let showGrid = $state(true);
	
	// Separate arrays for MIDI markers and Essentia onsets
	// These are filtered by duration/density but NOT by toggle state (PeaksPlayer handles toggles)
	const filteredMIDIMarkers = $derived.by(() => {
		if (midiMarkers.length === 0) return [];
		
		// Filter MIDI markers to audio duration only (not by toggle state)
		const markers = midiMarkers
			.map(t => typeof t === 'number' ? t : parseFloat(t))
			.filter(t => !isNaN(t) && t >= 0)
			.filter(t => !audioDuration || t <= audioDuration);
		
		if (markers.length !== midiMarkers.length) {
			console.log(`[VideoWorkbench] Filtered MIDI markers: ${midiMarkers.length} -> ${markers.length} (audio duration: ${audioDuration}s)`);
		}
		return markers;
	});
	
	const filteredEssentiaOnsets = $derived.by(() => {
		// Track onsetDensity to ensure reactivity
		const density = onsetDensity;
		
		if (!analysisData.onsets || analysisData.onsets.length === 0) {
			return [];
		}
		
		const bpm = analysisData.bpm > 0 ? analysisData.bpm : 120;
		const secondsPerBeat = 60 / bpm;
		const interval32 = secondsPerBeat / 8; // 1/32 note duration
		
		// Map density slider (0.0-1.0) to interval multiplier
		const scaler = 1 + (1 - density) * 31;
		const effectiveMinInterval = interval32 * scaler;

		const result = [];
		let lastTime = -effectiveMinInterval; // Ensure first can be picked
		
		for (const onset of analysisData.onsets) {
			if (onset - lastTime >= effectiveMinInterval) {
				result.push(onset);
				lastTime = onset;
			}
		}
		
		console.log(`[VideoWorkbench] filteredEssentiaOnsets: density=${density.toFixed(2)}, filtered ${result.length} from ${analysisData.onsets.length} onsets`);
		return result;
	});
	
	// Combined array for triggers (both can be used) - only include if toggle is enabled
	const filteredOnsets = $derived.by(() => {
		const midi = (showMIDIMarkers && filteredMIDIMarkers.length > 0) ? filteredMIDIMarkers : [];
		const onsets = (showOnsets && filteredEssentiaOnsets.length > 0) ? filteredEssentiaOnsets : [];
		const combined = [...midi, ...onsets].sort((a, b) => a - b);
		console.log(`[VideoWorkbench] filteredOnsets: ${midi.length} MIDI + ${onsets.length} Onsets = ${combined.length} total triggers`);
		return combined;
	});

	const gridMarkers = $derived.by(() => {
		if (!showGrid || !audioDuration || audioDuration === 0) return [];
		const bpm = analysisData.bpm > 0 ? analysisData.bpm : 120;
		const secondsPerBeat = 60 / bpm;
		const interval32 = secondsPerBeat / 8;
		
		const markers = [];
		// Align grid to first beat if available, else 0
		const startOffset = (analysisData.beats && analysisData.beats.length > 0) ? analysisData.beats[0] : 0;
		
		// Backfill from startOffset to 0
		for (let t = startOffset - interval32; t >= 0; t -= interval32) {
			markers.unshift(t);
		}
		
		// Forward fill
		for (let t = startOffset; t < audioDuration; t += interval32) {
			markers.push(t);
		}
		return markers;
	});
	let uniforms = $state({
		// VHS shader uniforms
		u_time: { value: 0.0 },
		u_distortion: { value: 0.075 },
		u_scanlineIntensity: { value: 0.26 },
		u_rgbShift: { value: 0.0015 },
		u_noise: { value: 0.022 },
		u_flickerIntensity: { value: 0.5 },
		u_trackingIntensity: { value: 0.1 },
		u_trackingSpeed: { value: 1.2 },
		u_trackingFreq: { value: 8.0 },
		u_waveAmplitude: { value: 0.1 },

		// Existing shader uniforms (Grayscale)
		u_strength: { value: 0.5 },
		// Old Vignette shader uniforms (kept for compatibility)
		u_vignette_strength: { value: 0.5 },
		u_vignette_falloff: { value: 0.3 },

		// XlsczN audio-reactive uniforms
		u_audioLevel: { value: 0.0 },
		u_bassLevel: { value: 0.0 },
		u_midLevel: { value: 0.0 },
		u_trebleLevel: { value: 0.0 },
		u_intensity: { value: 0.5 },
		u_colorShift: { value: 0.3 },
		u_pulseSpeed: { value: 2.0 },
		u_waveAmplitude: { value: 0.5 },
		u_resolution: { value: [1920, 1080] },

		// Water shader uniforms
		u_factor: { value: 0.5 },

		// Chromatic Aberration uniforms
		u_offset: { value: [0.002, 0.002] },
		u_radialModulation: { value: 0.0 },
		u_modulationOffset: { value: 0.15 },

		// Glitch uniforms
		u_glitch_strength: { value: 0.5 },
		u_columns: { value: 20.0 },
		u_ratio: { value: 0.5 },
		u_duration: { value: 0.6 },
		u_delay: { value: 1.5 },

		// Noise uniforms
		u_opacity: { value: 0.02 },
		u_premultiply: { value: 0.0 },

		// Vignette (new) uniforms
		u_offset_vignette: { value: 0.5 },
		u_darkness: { value: 0.5 },
		u_eskil: { value: 0.0 },

		// Bloom uniforms
		u_intensity_bloom: { value: 1.0 },
		u_luminanceThreshold: { value: 0.9 },
		u_luminanceSmoothing: { value: 0.025 },

		// Depth of Field uniforms
		u_focusDistance: { value: 0.3 },
		u_focusRange: { value: 0.5 },
		u_bokehScale: { value: 2.0 },
		u_focusPoint: { value: [0.5, 0.5] },

		// Depth visualization uniforms
		u_near: { value: 0.0 },
		u_far: { value: 1.0 },
		u_inverted: { value: 0.0 },

		// Sepia uniforms
		u_sepia_intensity: { value: 1.0 },

		// Scanline uniforms
		u_scanline_density: { value: 1.25 },
		u_scanline_intensity: { value: 0.3 },
		u_scanline_width: { value: 2.0 },
		u_scanline_speed: { value: 0.0 },
		u_scanline_offset: { value: 0.0 },

		// Pixelation uniforms
		u_granularity: { value: 20.0 },

		// Dot Screen uniforms
		u_dot_angle: { value: 1.57 },
		u_dot_scale: { value: 1.0 },

		// Hue Saturation uniforms
		u_hue: { value: 0.0 },
		u_saturation: { value: 0.0 },

		// Brightness Contrast uniforms
		u_brightness: { value: 0.0 },
		u_contrast: { value: 0.0 },

		// Color Depth uniforms
		u_bits: { value: 16.0 },

		// Tilt Shift uniforms
		u_tilt_offset: { value: 0.3 },
		u_tilt_feather: { value: 0.2 },
		u_tilt_rotation: { value: 0.0 },

		// Tone Mapping uniforms
		u_exposure: { value: 1.0 },
		u_maxLuminance: { value: 16.0 },
		u_middleGrey: { value: 0.6 },

		// ASCII uniforms
		u_charSize: { value: 8.0 },

		// Grid uniforms
		u_grid_scale: { value: 1.0 },
		u_grid_lineWidth: { value: 0.0 },

		// Lens Flare uniforms
		u_flareBrightness: { value: 1.0 },
		u_flareSize: { value: 0.005 },
		u_flareSpeed: { value: 0.4 },
		u_flareShape: { value: 0.1 },
		u_ghostScale: { value: 0.1 },
		u_haloScale: { value: 0.5 },
		u_starBurst: { value: 1.0 },
		u_sunPosition: { value: [0.5, 0.5, -1.0] },
		u_anamorphic: { value: 0.0 },
		u_colorGain: { value: [1.0, 0.8, 0.6] },
		u_secondaryGhosts: { value: 1.0 },
		u_additionalStreaks: { value: 1.0 },

		// CRT uniforms
		u_pixelSize: { value: 5.0 },
		u_distortion: { value: 0.3 },
		u_blur: { value: 0.3 },
		u_aberration: { value: 0.05 },
		u_scanlineIntensity: { value: 0.05 },
		u_scanlineSpeed: { value: 100.0 },
		u_gridIntensity: { value: 0.1 },
		u_vignetteIntensity: { value: 1.0 },
		u_dither: { value: 0.1 }
	});
	const fragmentShader = $derived.by(() => {
		let shader;
		switch (selectedShaderName) {
			case 'VHS': shader = vhsFragmentShader; break;
			case 'XlsczN': shader = xlsczNFragmentShader; break;
			case 'Water': shader = waterFragmentShader; break;
			case 'ChromaticAberration': shader = chromaticAberrationFragmentShader; break;
			case 'Glitch': shader = glitchFragmentShader; break;
			case 'Noise': shader = noiseFragmentShader; break;
			case 'Vignette': shader = vignetteFragmentShader; break;
			case 'Bloom': shader = bloomFragmentShader; break;
			case 'DepthOfField': shader = depthOfFieldFragmentShader; break;
			case 'Depth': shader = depthFragmentShader; break;
			case 'Sepia': shader = sepiaFragmentShader; break;
			case 'Scanline': shader = scanlineFragmentShader; break;
			case 'Pixelation': shader = pixelationFragmentShader; break;
			case 'DotScreen': shader = dotScreenFragmentShader; break;
			case 'HueSaturation': shader = hueSaturationFragmentShader; break;
			case 'BrightnessContrast': shader = brightnessContrastFragmentShader; break;
			case 'ColorDepth': shader = colorDepthFragmentShader; break;
			case 'ColorAverage': shader = colorAverageFragmentShader; break;
			case 'TiltShift': shader = tiltShiftFragmentShader; break;
			case 'ToneMapping': shader = toneMappingFragmentShader; break;
			case 'ASCII': shader = asciiFragmentShader; break;
			case 'Grid': shader = gridFragmentShader; break;
			case 'LensFlare': shader = lensFlareFragmentShader; break;
			case 'CRT': shader = crtFragmentShader; break;
			case 'Grayscale': shader = shaders.Grayscale; break;
			default: shader = shaders.Vignette; break;
		}
		console.log('[VideoWorkbench] Selected shader:', selectedShaderName, 'Shader length:', shader?.length || 0);
		return shader;
	});

	// --- Component Refs ---
	let shaderPlayerRef = $state();
	let sharedAudioRef = $state(); // Shared audio element
	let rafId; // RequestAnimationFrame ID for smooth time updates
	let fileInput;
	let audioInput;
	let midiInput;

	// --- Playback State ---
	let isPlaying = $state(false);

	// Speed Ramping State
	let enableSpeedRamping = $state(false);
	let speedRampSensitivity = $state(2.0); // How much energy affects speed
	let baseSpeed = $state(1.0); // Minimum/Base speed
	const ESSENTIA_HOP_SIZE = 512;
	const ESSENTIA_SAMPLE_RATE = 44100;
	const SECONDS_PER_FRAME = ESSENTIA_HOP_SIZE / ESSENTIA_SAMPLE_RATE;

	// High-precision time loop for sub-beat synchronization
	function updateTime() {
		if (sharedAudioRef && !sharedAudioRef.paused) {
			audioCurrentTime = sharedAudioRef.currentTime;
			
			// Handle Speed Ramping
			if (enableSpeedRamping && analysisData.energy?.curve && shaderPlayerRef) {
				const frameIndex = Math.floor(audioCurrentTime / SECONDS_PER_FRAME);
				if (frameIndex >= 0 && frameIndex < analysisData.energy.curve.length) {
					const energy = analysisData.energy.curve[frameIndex];
					// Formula: speed = base + (energy * sensitivity)
					// Energy is 0-1 normalized
					const newSpeed = baseSpeed + (energy * speedRampSensitivity);
					shaderPlayerRef.setSpeed(newSpeed);
				}
			} else if (shaderPlayerRef) {
				// Reset to normal if ramping disabled
				// Only reset if we haven't manually set it elsewhere? 
				// For now, assume this controls playback speed when playing
				shaderPlayerRef.setSpeed(1.0);
			}

			rafId = requestAnimationFrame(updateTime);
		}
	}

	$effect(() => {
		if (isPlaying) {
			// Start loop
			cancelAnimationFrame(rafId);
			updateTime();
		} else {
			// Stop loop
			cancelAnimationFrame(rafId);
		}
		
		return () => cancelAnimationFrame(rafId);
	});
	let videoCycleInterval = null;
	let videoCycleDuration = $state(5000); // 5 seconds per video
	let enableVideoCycling = $state(false);

	// --- Frame Buffer State ---
	let isPreloading = $state(false);
	let preloadProgress = $state(0);
	let preloadStatus = $state('');
	let isBufferReady = $state(false);

	// --- Theme State ---
	let themeKey = $state('standard');

	// --- Filter Toggle State ---
	let filtersEnabled = $state(true);

	// --- Audio Playback Time ---
	let audioCurrentTime = $state(0);
	let audioDuration = $state(0);

	// --- File Handling Logic ---
	function handleUploadClick() {
		fileInput?.click();
	}

	function handleAudioUploadClick() {
		audioInput?.click();
	}

	function handleMIDIUploadClick() {
		midiInput?.click();
	}

	async function onMIDISelected(event) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;

		midiFile = file;
		console.log(`[VideoWorkbench] 📁 MIDI file selected: ${file.name}`);

		try {
			const result = await parseMIDIFile(file);
			// Ensure times are numbers (not strings) and sorted
			midiMarkers = result.times
				.map(t => typeof t === 'number' ? t : parseFloat(t))
				.filter(t => !isNaN(t) && t >= 0)
				.sort((a, b) => a - b);
			
			console.log(`[VideoWorkbench] ✅ Parsed MIDI file: ${midiMarkers.length} note-on events`);
			if (midiMarkers.length > 0) {
				console.log(`[VideoWorkbench] MIDI markers range: ${midiMarkers[0]?.toFixed(3)}s - ${midiMarkers[midiMarkers.length - 1]?.toFixed(3)}s`);
				console.log(`[VideoWorkbench] First 5 MIDI markers:`, midiMarkers.slice(0, 5).map(t => t.toFixed(3)));
				console.log(`[VideoWorkbench] MIDI markers format check:`, {
					isArray: Array.isArray(midiMarkers),
					allNumbers: midiMarkers.every(t => typeof t === 'number'),
					sample: midiMarkers.slice(0, 3)
				});
			} else {
				console.warn(`[VideoWorkbench] ⚠️ MIDI file parsed but no markers found`);
			}
		} catch (err) {
			console.error('[VideoWorkbench] ❌ Failed to parse MIDI file:', err);
			console.error('[VideoWorkbench] Error details:', err.stack);
			midiFile = null;
			midiMarkers = [];
		} finally {
			// Reset file input to allow re-selecting the same file
			if (midiInput) {
				midiInput.value = '';
			}
		}
	}

	async function onAudioSelected(event) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;

		// Prevent duplicate calls if already analyzing
		if (isAnalyzingAudio) {
			console.warn("[VideoWorkbench] ⚠️ Already analyzing audio, skipping duplicate call");
			return;
		}

		audioFile = file;
		isAnalyzingAudio = true;
		
		// Initialize Essentia API FIRST (one-time analysis, no ongoing connection)
		// This sends the file to the server, gets results, then disconnects
		console.log("[VideoWorkbench] 📡 Starting Essentia API analysis (one-time request, no ongoing connection)...");
		console.log("[VideoWorkbench] File:", file.name, "Size:", (file.size / 1024).toFixed(2), "KB");
		
		try {
			if (!essentiaService) {
				essentiaService = new EssentiaService();
				await essentiaService.initialize();
			}
			
			const result = await essentiaService.analyzeFile(file);
			
			// Update analysis data with result from API
			analysisData = {
				bpm: result.bpm,
				beats: result.beats || [],
				onsets: result.onsets || [], // critical for transients
				energy: result.energy, // Contains curve for speed ramping
				confidence: result.confidence
			};
			
			console.log(`[VideoWorkbench] Analysis applied: ${analysisData.onsets.length} onsets, ${analysisData.bpm} BPM`);
			
		} catch (err) {
			console.error("[VideoWorkbench] ❌ Essentia analysis failed:", err);
			// Fallback or empty data
			analysisData = { bpm: 0, beats: [], onsets: [] };
		} finally {
			isAnalyzingAudio = false;
		}
		
		// Audio set up logic simplified - strictly Essentia + Peaks
		if (sharedAudioRef) {
			const objectUrl = URL.createObjectURL(file);
			sharedAudioRef.src = objectUrl;
			sharedAudioRef.volume = audioVolume;
			// Ensure we catch the duration
			sharedAudioRef.onloadedmetadata = () => {
				audioDuration = sharedAudioRef.duration;
			};
		}
	}

	/* Local Analysis Loop Removed - Pure Reactive Logic Trigger */
	
	let previousTime = 0;
	
	$effect(() => {
		const time = audioCurrentTime;
		
		// Reset tracking on seek or pause (approximate)
		if (!isPlaying || Math.abs(time - previousTime) > 1.0) {
			previousTime = time;
			return;
		}
		
		if (time > previousTime) {
			// Check if we crossed any onset (simple linear check for robustness)
			const hit = filteredOnsets.some(onset => onset > previousTime && onset <= time);
			
			if (hit) {
				isBeatActive = true;
				markerCounter++;
				setTimeout(() => isBeatActive = false, 100); // Visual blink duration
				
				// Video Swap Logic
				if (enableVideoCycling && markerCounter >= markerSwapThreshold) {
					// console.log("Marker threshold reached, swapping video");
					nextVideo();
					markerCounter = 0;
				}
			}
		}
		previousTime = time;
	});

	function handleAudioVolumeChange() {
		if (audioAnalyzer) {
			audioAnalyzer.setVolume(audioVolume);
		}
	}

	function playAudio() {
		// Control global playback state directly
		isPlaying = true;
		if (sharedAudioRef && sharedAudioRef.paused) {
			sharedAudioRef.play();
		}
	}

	function pauseAudio() {
		// Control global playback state directly
		isPlaying = false;
		if (sharedAudioRef && !sharedAudioRef.paused) {
			sharedAudioRef.pause();
		}
	}

	async function onFileSelected(event) {
		const files = Array.from(event.currentTarget.files || []);
		if (files.length === 0) return;

		console.log('Processing', files.length, 'video files');
		
		// Add to asset list for thumbnails
		for (const file of files) {
			const newAsset = {
				id: crypto.randomUUID(),
				file: file,
				name: file.name,
				objectUrl: URL.createObjectURL(file),
				thumbnailUrl: null
			};

			videoAssets.update((assets) => [...assets, newAsset]);
			if ($videoAssets.length === 1) activeVideo.set(newAsset);

			const thumbUrl = await generateThumbnail(file);
			videoAssets.update((assets) =>
				assets.map((asset) => (asset.id === newAsset.id ? { ...asset, thumbnailUrl: thumbUrl } : asset))
			);
		}
		
		// Reset file input
		if (fileInput) fileInput.value = '';
		
		// Pre-decode all videos into frame buffer
		await preloadAllVideos();
	}

	async function preloadAllVideos() {
		const allFiles = $videoAssets.map(asset => asset.file);
		if (allFiles.length === 0) return;

		isPreloading = true;
		isBufferReady = false;
		preloadProgress = 0;
		preloadStatus = 'Starting...';

		try {
			await frameBuffer.preloadClips(allFiles, (progress, status) => {
				preloadProgress = progress;
				preloadStatus = status;
			});
			isBufferReady = true;
			console.log('Frame buffer ready:', frameBuffer.totalFrames, 'frames');
		} catch (err) {
			console.error('Failed to preload videos:', err);
			preloadStatus = 'Error: ' + err.message;
		} finally {
			isPreloading = false;
		}
	}

	function handleVideoSelect(asset) {
		activeVideo.set(asset);
	}

	function togglePlayback() {
		if (shaderPlayerRef) {
			if (isPlaying) {
				shaderPlayerRef.pause();
				isPlaying = false;
			} else {
				shaderPlayerRef.play();
				isPlaying = true;
			}
		}
	}

	// Video cycling functionality - now uses frame buffer directly
	function nextVideo() {
		if (!shaderPlayerRef || $videoAssets.length <= 1) return;
		const currentIndex = $videoAssets.findIndex(asset => asset.id === $activeVideo?.id);
		const nextIndex = (currentIndex + 1) % $videoAssets.length;
		
        // Ensure seamless loop if we just wrapped
		activeVideo.set($videoAssets[nextIndex]);
		shaderPlayerRef.seekToClip(nextIndex);
	}

	function previousVideo() {
		if (!shaderPlayerRef || $videoAssets.length <= 1) return;
		const currentIndex = $videoAssets.findIndex(asset => asset.id === $activeVideo?.id);
		const prevIndex = currentIndex === 0 ? $videoAssets.length - 1 : currentIndex - 1;
		activeVideo.set($videoAssets[prevIndex]);
		shaderPlayerRef.seekToClip(prevIndex);
	}

    // Removed time-based cycling logic as we now use onVideoEnd
    /*
	function startVideoCycling() { ... }
	function stopVideoCycling() { ... }
    $effect(...)
    */

	// VHS presets
	function applyVHSPreset(preset) {
		switch (preset) {
			case 'classic':
				uniforms.u_distortion.value = 0.075;
				uniforms.u_scanlineIntensity.value = 0.26;
				uniforms.u_rgbShift.value = 0.0015;
				uniforms.u_noise.value = 0.022;
				uniforms.u_flickerIntensity.value = 0.5;
				uniforms.u_trackingIntensity.value = 0.1;
				uniforms.u_trackingSpeed.value = 1.2;
				uniforms.u_trackingFreq.value = 8.0;
				uniforms.u_waveAmplitude.value = 0.1;
				break;
			case 'damaged':
				uniforms.u_distortion.value = 0.15;
				uniforms.u_scanlineIntensity.value = 0.4;
				uniforms.u_rgbShift.value = 0.005;
				uniforms.u_noise.value = 0.08;
				uniforms.u_flickerIntensity.value = 1.2;
				uniforms.u_trackingIntensity.value = 0.3;
				uniforms.u_trackingSpeed.value = 2.0;
				uniforms.u_trackingFreq.value = 12.0;
				uniforms.u_waveAmplitude.value = 0.3;
				break;
			case 'clean':
				uniforms.u_distortion.value = 0.02;
				uniforms.u_scanlineIntensity.value = 0.1;
				uniforms.u_rgbShift.value = 0.0005;
				uniforms.u_noise.value = 0.005;
				uniforms.u_flickerIntensity.value = 0.1;
				uniforms.u_trackingIntensity.value = 0.02;
				uniforms.u_trackingSpeed.value = 0.5;
				uniforms.u_trackingFreq.value = 4.0;
				uniforms.u_waveAmplitude.value = 0.02;
				break;
			case 'heavy':
				uniforms.u_distortion.value = 0.3;
				uniforms.u_scanlineIntensity.value = 0.6;
				uniforms.u_rgbShift.value = 0.01;
				uniforms.u_noise.value = 0.15;
				uniforms.u_flickerIntensity.value = 1.8;
				uniforms.u_trackingIntensity.value = 0.5;
				uniforms.u_trackingSpeed.value = 3.0;
				uniforms.u_trackingFreq.value = 20.0;
				uniforms.u_waveAmplitude.value = 0.5;
				break;
		}
	}
	// Sync Video Playback with shared IsPlaying state
	$effect(() => {
		if (shaderPlayerRef) {
			if (isPlaying) {
				// Need to ensure audio is playing too? 
				// PeaksPlayer handles audio element play/pause based on isPlaying binding.
				// We just handle video.
				shaderPlayerRef.play();
				// Also ensure analyzer knows?
				if (audioAnalyzer) audioAnalyzer.isAnalyzing = true; 
			} else {
				shaderPlayerRef.pause();
				if (audioAnalyzer) audioAnalyzer.isAnalyzing = false;
			}
		}
	});

	// Handle video end for looping
	// Note: ShaderPlayer likely has an onVideoEnd prop or event we should use.
    // If not, we might need to check duration.
    // Assuming ShaderPlayer handles loop if 'loop' prop passed (we pass enableLooping)
</script>

<!-- The Shared Audio Element -->
<audio bind:this={sharedAudioRef} style="display: none;" crossorigin="anonymous"></audio>

<!-- Hidden file inputs for the entire workbench -->
	<input
		type="file"
		bind:this={fileInput}
		onchange={onFileSelected}
		accept="video/mp4,video/webm"
		multiple
		hidden
	/>
<input
	type="file"
	bind:this={audioInput}
	onchange={onAudioSelected}
	accept="audio/*"
	multiple
	hidden
/>
<input
	type="file"
	bind:this={midiInput}
	onchange={onMIDISelected}
	accept=".mid,.midi"
	hidden
/>

<div class="app-container">
	<aside class="sidebar">
		<h2>Video Shaders</h2>
		
		{#if audioFile}
			<div class="beat-indicator-container">
				<div class="beat-indicator-row">
					<div class="beat-label">Beat Trigger:</div>
					<div class="beat-light" class:active={isBeatActive}></div>
				</div>
				<div class="beat-info">
					{markerCounter} / {markerSwapThreshold}
				</div>
			</div>
		{/if}

		<div class="unified-controls">
			<Tweakpane.Pane title="Video Shaders Controls" theme={ThemeUtils.presets[themeKey]}>
				<!-- Theme Picker -->
				<Tweakpane.List
					bind:value={themeKey}
					label="Theme"
					options={Object.keys(ThemeUtils.presets)}
				/>

				<!-- Filter Toggle -->
				<Tweakpane.Checkbox
					bind:value={filtersEnabled}
					label="Enable Filters"
				/>

				<Tweakpane.Separator />

				<div class="thumbnail-gallery">
					{#each $videoAssets as asset (asset.id)}
						<button
							class="thumbnail-button"
							class:active={asset.id === $activeVideo?.id}
							onclick={() => handleVideoSelect(asset)}
							style:background-image={asset.thumbnailUrl ? `url(${asset.thumbnailUrl})` : 'none'}
						>
							{#if !asset.thumbnailUrl}
								<div class="thumbnail-placeholder">Loading...</div>
							{/if}
							<span class="thumbnail-label">{asset.name}</span>
						</button>
					{/each}
				</div>

				<Tweakpane.Separator />
				
				<Tweakpane.List
					bind:value={selectedShaderName}
					label="Shader"
					options={{
						VHS: 'VHS',
						XlsczN: 'XlsczN (Audio Reactive)',
						Water: 'Water',
						ChromaticAberration: 'Chromatic Aberration',
						Glitch: 'Glitch',
						Noise: 'Noise',
						Vignette: 'Vignette',
						Bloom: 'Bloom',
						DepthOfField: 'Depth of Field',
						Depth: 'Depth Visualization',
						Sepia: 'Sepia',
						Scanline: 'Scanline',
						Pixelation: 'Pixelation',
						DotScreen: 'Dot Screen',
						HueSaturation: 'Hue Saturation',
						BrightnessContrast: 'Brightness Contrast',
						ColorDepth: 'Color Depth',
						ColorAverage: 'Color Average',
						TiltShift: 'Tilt Shift',
						ToneMapping: 'Tone Mapping',
						ASCII: 'ASCII',
						Grid: 'Grid',
					LensFlare: 'Lens Flare',
					CRT: 'CRT (More CRT-like)',
						Grayscale: 'Grayscale'
					}}
				/>

				<!-- Video Controls -->
				<Tweakpane.Folder title="Video Controls" expanded={true}>
					<Button title="Upload Video" on:click={handleUploadClick} />
					
					{#if $activeVideo}
						<Tweakpane.Separator />
						
						<div class="playback-controls">
							<Button title={isPlaying ? "Pause" : "Play"} on:click={togglePlayback} />
						</div>
					{/if}
					
					{#if $videoAssets.length > 1}
						<Tweakpane.Separator />
						
						<div class="video-controls">
							<Button title="← Previous" on:click={previousVideo} />
							<Button title="Next →" on:click={nextVideo} />
						</div>
						
						<Tweakpane.Checkbox
							bind:value={enableVideoCycling}
							label="Auto Cycle Videos"
						/>
						<Tweakpane.Checkbox
							bind:value={enableLooping}
							label="Loop Playback"
						/>
						<!-- Removed slider since cycling is now sequential -->
					{/if}
				</Tweakpane.Folder>

				<!-- Audio Controls -->
				<Tweakpane.Folder title="Audio Controls" expanded={true}>
					<Button title="Upload Audio" on:click={handleAudioUploadClick} />
					<Button title="Upload MIDI" on:click={handleMIDIUploadClick} />
					
					{#if midiFile}
						<div class="midi-info">
							<strong>MIDI:</strong> {midiFile.name} ({midiMarkers.length} markers)
						</div>
						<Tweakpane.Checkbox
							bind:value={showMIDIMarkers}
							label="Show MIDI Markers"
						/>
					{/if}
					{#if analysisData.onsets && analysisData.onsets.length > 0}
						<Tweakpane.Checkbox
							bind:value={showOnsets}
							label="Show Essentia Onsets"
						/>
					{/if}
					
					{#if audioFile}
						<div class="audio-info">
							<strong>Audio:</strong> {audioFile.name}
							{#if isAnalyzingAudio}
								<span class="status-analyzing">(Analyzing...)</span>
							{:else if analysisData.bpm > 0}
								<span class="status-ready">({Math.round(analysisData.bpm)} BPM)</span>
							{/if}
						</div>
						
						<div class="audio-controls">
							<Button title="Play" on:click={playAudio} />
							<Button title="Pause" on:click={pauseAudio} />
						</div>
						
						<Tweakpane.Slider
							bind:value={audioVolume}
							label="Volume"
							min={0}
							max={1}
							step={0.01}
							on:change={handleAudioVolumeChange}
						/>
						
						
						<!-- Legacy Audio Reactive Playback & Filter Intensity removed -->
						
						
						<Tweakpane.Slider
							bind:value={onsetDensity}
							label="Transient Density"
							min={0.0}
							max={1.0}
							step={0.05}
						/>
						
						<Tweakpane.Checkbox
							bind:value={showGrid}
							label="Show 1/32 Grid"
						/>
                        
                        <Tweakpane.Separator />
						
						<!-- Speed Ramping Controls -->
						<Tweakpane.Folder title="Speed Ramping" expanded={false}>
							<Tweakpane.Checkbox
								bind:value={enableSpeedRamping}
								label="Enable Ramping"
							/>
							<Tweakpane.Slider
								bind:value={baseSpeed}
								label="Base Speed"
								min={0.1}
								max={2.0}
								step={0.1}
							/>
							<Tweakpane.Slider
								bind:value={speedRampSensitivity}
								label="Sensitivity"
								min={0}
								max={5.0}
								step={0.1}
							/>
						</Tweakpane.Folder>

						<Tweakpane.Separator />
                        
						<Tweakpane.Slider
							bind:value={markerSwapThreshold}
							label="Swap Threshold"
							min={1}
							max={16}
							step={1}
						/>
                        
						<!-- Beat Indicator removed from here -->
					{/if}
				</Tweakpane.Folder>

				{#if selectedShaderName === 'XlsczN'}
					<Tweakpane.Folder title="Audio Reactive Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_intensity.value}
							label="Intensity"
							min={0}
							max={2}
							step={0.01}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_colorShift.value}
							label="Color Shift"
							min={0}
							max={1}
							step={0.01}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_pulseSpeed.value}
							label="Pulse Speed"
							min={0.1}
							max={5}
							step={0.1}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_waveAmplitude.value}
							label="Wave Amplitude"
							min={0}
							max={2}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'VHS'}
					<Tweakpane.Folder title="VHS Presets" expanded={true}>
						<div class="preset-buttons">
							<Button title="Classic VHS" on:click={() => applyVHSPreset('classic')} />
							<Button title="Damaged Tape" on:click={() => applyVHSPreset('damaged')} />
							<Button title="Clean VHS" on:click={() => applyVHSPreset('clean')} />
							<Button title="Heavy Distortion" on:click={() => applyVHSPreset('heavy')} />
						</div>
					</Tweakpane.Folder>

					<Tweakpane.Folder title="VHS Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_distortion.value}
							label="Barrel Distortion"
							min={0}
							max={0.5}
							step={0.01}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_scanlineIntensity.value}
							label="Scanline Intensity"
							min={0}
							max={1}
							step={0.01}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_rgbShift.value}
							label="RGB Shift"
							min={0}
							max={0.1}
							step={0.001}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_noise.value}
							label="Noise"
							min={0}
							max={0.5}
							step={0.01}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_flickerIntensity.value}
							label="Flicker Intensity"
							min={0}
							max={2.0}
							step={0.01}
						/>
					</Tweakpane.Folder>
					
					<Tweakpane.Folder title="VHS Tracking" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_trackingIntensity.value}
							label="Tracking Intensity"
							min={0}
							max={1}
							step={0.01}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_trackingSpeed.value}
							label="Tracking Speed"
							min={0}
							max={5.0}
							step={0.1}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_trackingFreq.value}
							label="Tracking Frequency"
							min={1}
							max={100}
							step={1}
						/>
					</Tweakpane.Folder>
					
					<Tweakpane.Folder title="VHS Tape Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_waveAmplitude.value}
							label="Wave Amplitude"
							min={0}
							max={1}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Grayscale'}
					<Tweakpane.Slider
						bind:value={uniforms.u_strength.value}
						label="Strength"
						min={0}
						max={1}
						step={0.01}
					/>
				{/if}

				{#if selectedShaderName === 'Water'}
					<Tweakpane.Folder title="Water Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_factor.value}
							label="Factor"
							min={0}
							max={2}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'ChromaticAberration'}
					<Tweakpane.Folder title="Chromatic Aberration" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_offset.value[0]}
							label="Offset X"
							min={0}
							max={0.02}
							step={0.0001}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_offset.value[1]}
							label="Offset Y"
							min={0}
							max={0.02}
							step={0.0001}
						/>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_radialModulation.value}
							label="Radial Modulation"
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_modulationOffset.value}
							label="Modulation Offset"
							min={0}
							max={1}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Glitch'}
					<Tweakpane.Folder title="Glitch Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_glitch_strength.value}
							label="Strength"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_columns.value}
							label="Columns"
							min={5}
							max={50}
							step={1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_ratio.value}
							label="Ratio"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_duration.value}
							label="Duration"
							min={0.1}
							max={2}
							step={0.1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_delay.value}
							label="Delay"
							min={0.5}
							max={5}
							step={0.1}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Noise'}
					<Tweakpane.Folder title="Noise Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_opacity.value}
							label="Opacity"
							min={0}
							max={0.5}
							step={0.001}
						/>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_premultiply.value}
							label="Premultiply"
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Vignette'}
					<Tweakpane.Folder title="Vignette Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_offset_vignette.value}
							label="Offset"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_darkness.value}
							label="Darkness"
							min={0}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_eskil.value}
							label="Eskil Mode"
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Bloom'}
					<Tweakpane.Folder title="Bloom Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_intensity_bloom.value}
							label="Intensity"
							min={0}
							max={3}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_luminanceThreshold.value}
							label="Luminance Threshold"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_luminanceSmoothing.value}
							label="Luminance Smoothing"
							min={0}
							max={0.1}
							step={0.001}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'DepthOfField'}
					<Tweakpane.Folder title="Depth of Field" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_focusDistance.value}
							label="Focus Distance"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_focusRange.value}
							label="Focus Range"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_bokehScale.value}
							label="Bokeh Scale"
							min={0}
							max={5}
							step={0.1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_focusPoint.value[0]}
							label="Focus Point X"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_focusPoint.value[1]}
							label="Focus Point Y"
							min={0}
							max={1}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Depth'}
					<Tweakpane.Folder title="Depth Visualization" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_near.value}
							label="Near Plane"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_far.value}
							label="Far Plane"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_inverted.value}
							label="Inverted"
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Sepia'}
					<Tweakpane.Folder title="Sepia Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_sepia_intensity.value}
							label="Intensity"
							min={0}
							max={1}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Scanline'}
					<Tweakpane.Folder title="Scanline Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_scanline_density.value}
							label="Density"
							min={0.5}
							max={10}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_scanline_intensity.value}
							label="Intensity"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_scanline_width.value}
							label="Width/Sharpness"
							min={0.5}
							max={10}
							step={0.1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_scanline_speed.value}
							label="Animation Speed"
							min={-2}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_scanline_offset.value}
							label="Offset"
							min={-1}
							max={1}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Pixelation'}
					<Tweakpane.Folder title="Pixelation Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_granularity.value}
							label="Granularity"
							min={1}
							max={100}
							step={1}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'DotScreen'}
					<Tweakpane.Folder title="Dot Screen Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_dot_angle.value}
							label="Angle"
							min={0}
							max={6.28}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_dot_scale.value}
							label="Scale"
							min={0.1}
							max={10}
							step={0.1}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'HueSaturation'}
					<Tweakpane.Folder title="Hue Saturation Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_hue.value}
							label="Hue"
							min={-3.14}
							max={3.14}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_saturation.value}
							label="Saturation"
							min={-1}
							max={1}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'BrightnessContrast'}
					<Tweakpane.Folder title="Brightness Contrast Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_brightness.value}
							label="Brightness"
							min={-1}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_contrast.value}
							label="Contrast"
							min={-1}
							max={1}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'ColorDepth'}
					<Tweakpane.Folder title="Color Depth Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_bits.value}
							label="Bits"
							min={1}
							max={16}
							step={1}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'ColorAverage'}
					<Tweakpane.Folder title="Color Average" expanded={true}>
						<p>Converts image to grayscale average</p>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'TiltShift'}
					<Tweakpane.Folder title="Tilt Shift Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_tilt_offset.value}
							label="Offset"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_tilt_feather.value}
							label="Feather"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_tilt_rotation.value}
							label="Rotation"
							min={0}
							max={6.28}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'ToneMapping'}
					<Tweakpane.Folder title="Tone Mapping Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_exposure.value}
							label="Exposure"
							min={0}
							max={5}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_maxLuminance.value}
							label="Max Luminance"
							min={1}
							max={32}
							step={0.1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_middleGrey.value}
							label="Middle Grey"
							min={0}
							max={2}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'ASCII'}
					<Tweakpane.Folder title="ASCII Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_charSize.value}
							label="Character Size"
							min={4}
							max={32}
							step={1}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Grid'}
					<Tweakpane.Folder title="Grid Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_grid_scale.value}
							label="Scale"
							min={0}
							max={10}
							step={0.1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_grid_lineWidth.value}
							label="Line Width"
							min={0}
							max={0.1}
							step={0.001}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'LensFlare'}
					<Tweakpane.Folder title="Lens Flare Main" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_flareBrightness.value}
							label="Brightness"
							min={0}
							max={3}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_flareSize.value}
							label="Flare Size"
							min={0.001}
							max={0.02}
							step={0.001}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_flareSpeed.value}
							label="Flare Speed"
							min={0}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_flareShape.value}
							label="Flare Shape"
							min={0.01}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_sunPosition.value[0]}
							label="Sun Position X"
							min={-1}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_sunPosition.value[1]}
							label="Sun Position Y"
							min={-1}
							max={2}
							step={0.01}
						/>
					</Tweakpane.Folder>

					<Tweakpane.Folder title="Lens Flare Advanced" expanded={false}>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_anamorphic.value}
							label="Anamorphic"
						/>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_secondaryGhosts.value}
							label="Secondary Ghosts"
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_ghostScale.value}
							label="Ghost Scale"
							min={0.01}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_additionalStreaks.value}
							label="Additional Streaks"
						/>
						<Tweakpane.Checkbox
							bind:value={uniforms.u_starBurst.value}
							label="Star Burst"
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_haloScale.value}
							label="Halo Scale"
							min={0.1}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_colorGain.value[0]}
							label="Color Gain R"
							min={0}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_colorGain.value[1]}
							label="Color Gain G"
							min={0}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_colorGain.value[2]}
							label="Color Gain B"
							min={0}
							max={2}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'CRT'}
					<Tweakpane.Folder title="CRT Main Effects" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_pixelSize.value}
							label="Pixel Size"
							min={1}
							max={20}
							step={0.5}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_distortion.value}
							label="Distortion"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_blur.value}
							label="Blur"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_aberration.value}
							label="Chromatic Aberration"
							min={0}
							max={0.2}
							step={0.001}
						/>
					</Tweakpane.Folder>

					<Tweakpane.Folder title="CRT Scanlines & Grid" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_scanlineIntensity.value}
							label="Scanline Intensity"
							min={0}
							max={0.2}
							step={0.001}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_scanlineSpeed.value}
							label="Scanline Speed"
							min={0}
							max={300}
							step={1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_gridIntensity.value}
							label="Grid Intensity"
							min={0}
							max={0.5}
							step={0.01}
						/>
					</Tweakpane.Folder>

					<Tweakpane.Folder title="CRT Post Effects" expanded={false}>
						<Tweakpane.Slider
							bind:value={uniforms.u_vignetteIntensity.value}
							label="Vignette Intensity"
							min={0}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_dither.value}
							label="Dither"
							min={0}
							max={0.5}
							step={0.01}
						/>
					</Tweakpane.Folder>
				{/if}
			</Tweakpane.Pane>
		</div>
	</aside>

	<main class="main-content">
		<div class="player-area">
			{#if isPreloading}
				<div class="loading-overlay">
				<div class="loading-content">
					<h3>Preparing Videos...</h3>
					<div class="progress-bar">
						<div class="progress-fill" style="width: {preloadProgress * 100}%"></div>
					</div>
					<p class="progress-status">{preloadStatus}</p>
					<p class="progress-percent">{Math.round(preloadProgress * 100)}%</p>
				</div>
			</div>
		{:else if isBufferReady}
			<ShaderPlayer
				bind:this={shaderPlayerRef}
				{frameBuffer}
				{fragmentShader}
				bind:uniforms={uniforms}
				{filtersEnabled}
				{analysisData}
				{enableLooping}
			/>
			{:else}
				<div class="placeholder">
					<h3>Upload videos to begin</h3>
					<p>All videos will be pre-decoded for seamless playback</p>
				</div>
			{/if}
		</div>

		<div class="waveform-wrapper" style="position: relative;">
			{#if isAnalyzingAudio}
				<div style="position: absolute; inset: 0; z-index: 50; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: rgba(0,0,0,0.8); backdrop-filter: blur(4px);">
					<div style="width: 3rem; height: 3rem; border: 4px solid #06b6d4; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem;"></div>
					<div style="color: #22d3ee; font-family: monospace; font-size: 1.125rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;">Running Essentia Analysis...</div>
					<div style="color: #9ca3af; font-size: 0.75rem; margin-top: 0.5rem;">Extracting beats & transients</div>
				</div>
			{/if}
			
			<PeaksPlayer
				audioFile={audioFile}
                mediaElement={sharedAudioRef}
				bind:currentTime={audioCurrentTime}
				bind:duration={audioDuration}
				bind:isPlaying={isPlaying}
				onsets={filteredEssentiaOnsets}
				midiMarkers={filteredMIDIMarkers}
				bind:showOnsets={showOnsets}
				bind:showMIDIMarkers={showMIDIMarkers}
				segments={[]} 
				grid={gridMarkers}
				onSeek={(time) => {
					if (audioAnalyzer) audioAnalyzer.seekTo(time);
					else {
						audioCurrentTime = time;
					}
				}}
			/>
		</div>
	</main>
</div>

<style>
    .beat-indicator-row {
        display: flex;
        align-items: center;
        margin-top: 10px;
        padding: 5px;
    }
    .beat-label {
        font-size: 11px;
        color: #888;
        margin-right: 10px;
    }
    .beat-light {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #333;
        border: 1px solid #555;
        transition: background-color 0.05s;
    }
    .beat-light.active {
        background-color: #00ff00;
        box-shadow: 0 0 8px #00ff00;
        border-color: #00ff00;
    }

	.app-container { display: flex; height: 100vh; background-color: #1a1a1a; color: #fff; }
	.sidebar { width: 350px; padding: 1rem; background-color: #242424; display: flex; flex-direction: column; gap: 1.5rem; overflow-y: auto; }
	.sidebar h2 { text-align: center; margin-bottom: 0; }
	.unified-controls { flex: 1; }
	.main-content { 
		flex-grow: 1; 
		display: flex; 
		flex-direction: column;
		justify-content: flex-start; 
		align-items: stretch; 
		padding: 1rem; 
		overflow-x: hidden;
		min-width: 0; /* Allows flex item to shrink below content size */
	}
	.placeholder { text-align: center; }
	.playback-controls { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
	.thumbnail-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 1rem; }
	.thumbnail-button { background-color: #333; border: 2px solid #444; border-radius: 4px; padding: 0; cursor: pointer; transition: all 0.2s ease; font-family: inherit; color: inherit; width: 100%; aspect-ratio: 16 / 9; background-size: cover; background-position: center; position: relative; display: flex; align-items: flex-end; justify-content: center; }
	.thumbnail-button:hover { border-color: #666; }
	.thumbnail-button.active { border-color: #00aaff; }
	.thumbnail-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #444; color: #888; position: absolute; top: 0; left: 0; }
	.thumbnail-label {
		font-size: 0.8rem;
		background-color: rgba(0,0,0,0.6);
		padding: 2px 4px;
		border-radius: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 100%;
		text-align: center;
		z-index: 1;
	}

	.beat-indicator-container {
		background: #111;
		border: 1px solid #333;
		border-radius: 4px;
		margin: 0 0 1rem 0;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.beat-indicator-row {
		display: flex;
		align-items: center;
		margin: 0; /* Override previous margin */
		padding: 0;
	}

	.beat-info {
		font-family: monospace;
		color: #666;
		font-size: 0.9rem;
	}

	.audio-info {
		padding: 0.5rem 0;
		font-size: 0.9rem;
		color: #ccc;
	}

	.status-analyzing { color: #ffaa00; margin-left: 0.5rem; font-style: italic; }
	.status-ready { color: #00ffaa; margin-left: 0.5rem; }

	.video-controls {
		display: flex;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.preset-buttons {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin: 0.5rem 0;
	}

	.loading-overlay {
		width: 854px;
		height: 480px;
		background-color: #000;
		display: flex;
		justify-content: center;
		align-items: center;
		border-radius: 8px;
	}

	.loading-content {
		text-align: center;
		width: 80%;
		max-width: 400px;
	}

	.loading-content h3 {
		margin-bottom: 1.5rem;
		color: #fff;
	}

	.progress-bar {
		height: 8px;
		background-color: #333;
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #00aaff, #00ffaa);
		transition: width 0.2s ease;
	}

	.progress-status {
		font-size: 0.9rem;
		color: #888;
		margin-bottom: 0.5rem;
	}

	.waveform-wrapper {
		width: 100%;
		max-width: 100%;
		overflow-x: hidden;
		margin-top: 1rem;
	}

	.progress-percent {
		font-size: 2rem;
		font-weight: bold;
		color: #00aaff;
	}

	.placeholder p {
		color: #666;
		margin-top: 0.5rem;
	}
</style>
