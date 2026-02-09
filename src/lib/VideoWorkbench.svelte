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
	import { anamorphicBreatheFragmentShader, anamorphicBreatheUniforms } from '$lib/shaders/anamorphic-breathe-shader.js';
	import { AudioAnalyzer } from '$lib/audio-utils.js';
	import { EssentiaService } from '$lib/essentia-service.js';
	import { parseMIDIFile } from '$lib/midi-utils.js';
import { frameBuffer } from './webcodecs-frame-buffer.js';

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
	let analysisData = $state({ beats: [], bpm: 0, onsets: [], structure: { sections: [], boundaries: [] }, energy: null });
	let isAnalyzingAudio = $state(false);
	let audioFile = $state(null);
	let audioFileUrl = $state(null); // Store blob URL to prevent garbage collection
	let midiFile = $state(null);
	let midiMarkers = $state([]);
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
	let onsetDensity = $state(1.0); // Density control for Essentia onsets
	let midiDensity = $state(1.0); // Density control for MIDI markers
	let enableRandomSkip = $state(false); // Toggle random skip
	let randomSkipChance = $state(0.3); // Probability of skipping a marker (0-0.5)
	let markerSwapThreshold = $state(4); // Swap video after this many markers
	let markerCounter = $state(0); // Current count of markers hit
	let isBeatActive = $state(false); // For visual indicator
	let lastBeatTime = 0; // Debounce for beat detection
	
	let enableLooping = $state(true); // Loop/auto-cycle within playback
	
	let showGrid = $state(true);
	
	// Section looping
	let loopSectionIndex = $state(-1); // -1 = no loop, 0+ = loop that section
	
	// Separate arrays for MIDI markers and Essentia onsets
	// Seeded random function for deterministic random skip
	function seededRandom(seed) {
		const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
		return x - Math.floor(x);
	}
	
	// These are filtered by duration/density but NOT by toggle state (PeaksPlayer handles toggles)
	const filteredMIDIMarkers = $derived.by(() => {
		if (midiMarkers.length === 0) return [];
		
		const density = midiDensity;
		const doRandomSkip = enableRandomSkip;
		const skipChance = randomSkipChance;
		
		// Filter MIDI markers to audio duration
		let markers = midiMarkers
			.map(t => typeof t === 'number' ? t : parseFloat(t))
			.filter(t => !isNaN(t) && t >= 0)
			.filter(t => !audioDuration || t <= audioDuration);
		
		// Apply density filtering using time-interval approach (same as onset density)
		if (density < 1.0) {
			const bpm = analysisData.bpm > 0 ? analysisData.bpm : 120;
			const secondsPerBeat = 60 / bpm;
			const interval32 = secondsPerBeat / 8; // 1/32 note duration
			
			// Map density slider (0.0-1.0) to interval multiplier
			const scaler = 1 + (1 - density) * 31;
			const effectiveMinInterval = interval32 * scaler;
			
			let result = [];
			let lastTime = -effectiveMinInterval; // Ensure first can be picked
			
			for (const marker of markers) {
				if (marker - lastTime >= effectiveMinInterval) {
					result.push(marker);
					lastTime = marker;
				}
			}
			
			markers = result;
		}
		
		// Apply random skip
		if (doRandomSkip && skipChance > 0) {
			markers = markers.filter((_, i) => seededRandom(i) > skipChance);
		}
		
		console.log(`[VideoWorkbench] Filtered MIDI markers: ${midiMarkers.length} -> ${markers.length} (density=${density.toFixed(2)}, randomSkip=${doRandomSkip})`);
		return markers;
	});
	
	const filteredEssentiaOnsets = $derived.by(() => {
		// Track onsetDensity to ensure reactivity
		const density = onsetDensity;
		const doRandomSkip = enableRandomSkip;
		const skipChance = randomSkipChance;
		
		if (!analysisData.onsets || analysisData.onsets.length === 0) {
			return [];
		}
		
		const bpm = analysisData.bpm > 0 ? analysisData.bpm : 120;
		const secondsPerBeat = 60 / bpm;
		const interval32 = secondsPerBeat / 8; // 1/32 note duration
		
		// Map density slider (0.0-1.0) to interval multiplier
		const scaler = 1 + (1 - density) * 31;
		const effectiveMinInterval = interval32 * scaler;

		let result = [];
		let lastTime = -effectiveMinInterval; // Ensure first can be picked
		
		for (const onset of analysisData.onsets) {
			if (onset - lastTime >= effectiveMinInterval) {
				result.push(onset);
				lastTime = onset;
			}
		}
		
		// Apply random skip
		if (doRandomSkip && skipChance > 0) {
			result = result.filter((_, i) => seededRandom(i + 1000) > skipChance);
		}
		
		console.log(`[VideoWorkbench] filteredEssentiaOnsets: density=${density.toFixed(2)}, randomSkip=${doRandomSkip}, filtered ${result.length} from ${analysisData.onsets.length} onsets`);
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

	// Cleanup effect for audio blob URL to prevent memory leaks
	$effect(() => {
		// Return cleanup function
		return () => {
			if (audioFileUrl) {
				console.log('[VideoWorkbench] Cleaning up audio blob URL');
				URL.revokeObjectURL(audioFileUrl);
			}
		};
	});

	$effect(() => {
		return () => {
			if (audioAnalyzer) {
				audioAnalyzer.destroy();
				audioAnalyzer = null;
			}
		};
	});

	// === Phase 3: Section Tracking ===
	// Track current section based on audio time and analysisData.structure.sections
	const currentSection = $derived.by(() => {
		const sections = analysisData.structure?.sections;
		if (!sections || sections.length === 0) {
			return { label: 'song', start: 0, end: audioDuration || 0, index: 0 };
		}
		
		const time = audioCurrentTime;
		for (let i = 0; i < sections.length; i++) {
			const section = sections[i];
			if (time >= section.start && time < section.end) {
				return { ...section, index: i };
			}
		}
		// Fallback to last section if at the very end
		const lastSection = sections[sections.length - 1];
		return { ...lastSection, index: sections.length - 1 };
	});

	// Track section changes for video pool switching
	let previousSectionIndex = $state(-1);
	
	$effect(() => {
		if (currentSection.index !== previousSectionIndex) {
			console.log(`[VideoWorkbench] Section changed: ${currentSection.label} (${currentSection.index})`);
			previousSectionIndex = currentSection.index;
			
			// Check if current video is in the new section's pool
			if ($activeVideo && currentSectionVideos.length > 0) {
				const isInPool = currentSectionVideos.some(v => v.id === $activeVideo?.id);
				if (!isInPool) {
				// Current video not in new section's pool - switch to first video in pool
				console.log(`[VideoWorkbench] Video not in section pool, switching...`);
				const nextVideo = currentSectionVideos[0];
				const globalIndex = $videoAssets.findIndex(asset => asset.id === nextVideo.id);
				// Update lastActiveVideoId BEFORE setting activeVideo to prevent duplicate seekToClip
				lastActiveVideoId = nextVideo.id;
				activeVideo.set(nextVideo);
				if (shaderPlayerRef) {
					shaderPlayerRef.seekToClip(globalIndex, audioCurrentTime, isSpeedRampActive());
				}
			}
			}
		}
	});

	// Video pool assignment per section (Phase 3)
	// Map from section index -> array of video asset indices
	let sectionVideoPools = $state({});
	
	// Helper functions for section video pools
	function isVideoInSection(sectionIndex, videoIndex) {
		const pool = sectionVideoPools[sectionIndex];
		if (!pool) return true; // Default: all videos in all sections
		return pool.includes(videoIndex);
	}
	
	function toggleVideoInSection(sectionIndex, videoIndex) {
		// Initialize pool if needed (default to all videos)
		if (!sectionVideoPools[sectionIndex]) {
			sectionVideoPools[sectionIndex] = $videoAssets.map((_, i) => i);
		}
		
		const pool = sectionVideoPools[sectionIndex];
		const idx = pool.indexOf(videoIndex);
		if (idx >= 0) {
			pool.splice(idx, 1);
		} else {
			pool.push(videoIndex);
		}
		// Trigger reactivity
		sectionVideoPools = { ...sectionVideoPools };
	}
	
	function formatSectionTime(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
	
	// Handle section loop change
	function handleSectionLoopChange() {
		if (loopSectionIndex >= 0 && analysisData.structure?.sections) {
			const section = analysisData.structure.sections[loopSectionIndex];
			if (section && sharedAudioRef) {
				// Jump to section start
				sharedAudioRef.currentTime = section.start;
				console.log(`[VideoWorkbench] Looping section: ${section.label} (${section.start}s - ${section.end}s)`);
			}
		} else {
			console.log('[VideoWorkbench] Section loop disabled');
		}
	}
	
	// Effect to handle section looping during playback
	$effect(() => {
		if (loopSectionIndex >= 0 && analysisData.structure?.sections && isPlaying) {
			const section = analysisData.structure.sections[loopSectionIndex];
			if (section && audioCurrentTime >= section.end - 0.05) {
				// Loop back to section start
				if (sharedAudioRef) {
					sharedAudioRef.currentTime = section.start;
				}
			}
		}
	});
	
	// Get videos available in current section
	const currentSectionVideos = $derived.by(() => {
		const pool = sectionVideoPools[currentSection.index];
		if (!pool || pool.length === 0) {
			// No pool defined, use all videos
			return $videoAssets;
		}
		return $videoAssets.filter((_, i) => pool.includes(i));
	});
	
	// Store base values for FX triggers (so we can spike and return)
	let baseNoiseValue = 0;
	let baseRgbShiftValue = 0.0015;
	
	let uniforms = $state({
		// VHS shader uniforms
		u_time: { value: 0.0 },
		u_distortion: { value: 0.075 },
		u_scanlineIntensity: { value: 0.26 },
		u_rgbShift: { value: 0.0015 },
		u_noise: { value: 0.0 },
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
		u_resolution: { value: [1280, 720] },

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
		u_dither: { value: 0.1 },

		// Anamorphic Breathe uniforms
		u_chromatic_enable: { value: 1.0 },
		u_chromatic_amount: { value: 0.5 },
		u_chromatic_speed: { value: 0.8 },
		u_chromatic_style: { value: 1.0 },
		u_defocus_enable: { value: 1.0 },
		u_defocus_amount: { value: 0.4 },
		u_defocus_speed: { value: 0.5 },
		u_anamorphic_ratio: { value: 1.5 },
		u_breathe_intensity: { value: 1.0 },
		u_breathe_sync: { value: 1.0 }
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
			case 'AnamorphicBreathe': shader = anamorphicBreatheFragmentShader; break;
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
	let speedRampMinSpeed = $state(0.8); // Minimum speed (at low energy)
	let speedRampMaxSpeed = $state(1.8); // Maximum speed (at high energy)
	let speedRampSmoothing = $state(0.15); // EMA alpha (0 = no smoothing, higher = smoother)
	let speedRampPunch = $state(1.4); // Gamma (1 = linear, >1 = punchy highs, <1 = punchy lows)
	
	// Pre-processed speed ramp data (computed once when params change)
	let processedSpeedCurve = $state(null); // Float32Array of pre-computed speeds
	let processedTimeRemap = $state(null); // Float32Array of cumulative time values
	let speedCurveTimestep = $state(0); // Seconds per sample in the curve
	
	// Offset to handle smooth transitions when toggling speed ramping
	let speedRampTimeOffset = $state(0); // Added to remapped time for continuity
	let wasSpeedRampingEnabled = false; // Track previous state
	
	// Visual feedback for speed ramping
	let currentSpeed = $state(1.0); // Current playback speed (for display)
	let currentEnergy = $state(0); // Current energy level (for display)
	
	const ESSENTIA_HOP_SIZE = 512;
	const ESSENTIA_SAMPLE_RATE = 44100;
	const SECONDS_PER_FRAME = ESSENTIA_HOP_SIZE / ESSENTIA_SAMPLE_RATE;
	const TARGET_FPS = 24; // Video frame rate for audio-to-frame sync
	
	/**
	 * Pre-process energy curve into speed and time remap curves
	 * Called once when Essentia data loads or when parameters change
	 */
	function preprocessSpeedCurve() {
		if (!analysisData.energy?.curve || analysisData.energy.curve.length === 0) {
			processedSpeedCurve = null;
			processedTimeRemap = null;
			console.log('[SpeedRamp] No energy curve available');
			return;
		}

		const rawCurve = analysisData.energy.curve;
		const N = rawCurve.length;

		// Calculate mean and std locally from the curve (API values are unreliable)
		let sum = 0;
		for (let i = 0; i < N; i++) {
			sum += rawCurve[i];
		}
		const mean = sum / N;

		let sqDiffSum = 0;
		for (let i = 0; i < N; i++) {
			const diff = rawCurve[i] - mean;
			sqDiffSum += diff * diff;
		}
		const std = Math.sqrt(sqDiffSum / N) || 1; // Fallback to 1 if std is 0
		// Use audio duration from the loaded audio element, or calculate from hop size
		const duration = audioDuration > 0 ? audioDuration : (N * SECONDS_PER_FRAME);
		const dt = duration / Math.max(1, N - 1);
		speedCurveTimestep = dt;
		
		console.log(`[SpeedRamp] Pre-processing ${N} samples, duration=${duration.toFixed(2)}s, dt=${(dt*1000).toFixed(2)}ms`);
		console.log(`[SpeedRamp] Params: min=${speedRampMinSpeed}x, max=${speedRampMaxSpeed}x, smooth=${speedRampSmoothing}, punch=${speedRampPunch}`);
		
		// Step 1: Z-score normalize using mean/std from Essentia
		const normalized = new Float32Array(N);
		for (let i = 0; i < N; i++) {
			const z = (rawCurve[i] - mean) / (std || 1e-9);
			// Map z-score (typically -2 to +2) to 0-1 range
			normalized[i] = Math.max(0, Math.min(1, (z + 2) / 4));
		}
		
		// Step 2: EMA smoothing (if enabled)
		const smoothed = new Float32Array(N);
		if (speedRampSmoothing > 0) {
			const alpha = speedRampSmoothing;
			smoothed[0] = normalized[0];
			for (let i = 1; i < N; i++) {
				smoothed[i] = alpha * normalized[i] + (1 - alpha) * smoothed[i - 1];
			}
		} else {
			smoothed.set(normalized);
		}
		
		// Step 3: Gamma correction (punch) and map to speed range
		const speeds = new Float32Array(N);
		const speedRange = speedRampMaxSpeed - speedRampMinSpeed;
		for (let i = 0; i < N; i++) {
			const shaped = Math.pow(smoothed[i], speedRampPunch);
			speeds[i] = speedRampMinSpeed + speedRange * shaped;
		}
		
		// Step 4: Compute cumulative time remap (integral of speed)
		const timeRemap = new Float32Array(N);
		timeRemap[0] = 0;
		for (let i = 1; i < N; i++) {
			const avgSpeed = (speeds[i - 1] + speeds[i]) * 0.5;
			timeRemap[i] = timeRemap[i - 1] + avgSpeed * dt;
		}
		
		processedSpeedCurve = speeds;
		processedTimeRemap = timeRemap;
		
		// Debug: sample some values
		const sampleIndices = [0, Math.floor(N/4), Math.floor(N/2), Math.floor(3*N/4), N-1];
		console.log(`[SpeedRamp] Pre-processing complete. Speed range: ${Math.min(...speeds).toFixed(2)}x - ${Math.max(...speeds).toFixed(2)}x`);
		console.log(`[SpeedRamp] Total remapped duration: ${timeRemap[N-1].toFixed(2)}s (original: ${duration.toFixed(2)}s)`);
		console.log(`[SpeedRamp] Sample speeds:`, sampleIndices.map(i => `[${i}]=${speeds[i]?.toFixed(2)}x`).join(', '));
		console.log(`[SpeedRamp] Sample timeRemap:`, sampleIndices.map(i => `[${i}]=${timeRemap[i]?.toFixed(2)}s`).join(', '));
		console.log(`[SpeedRamp] Raw energy samples:`, sampleIndices.map(i => `[${i}]=${rawCurve[i]?.toFixed(4)}`).join(', '));
		console.log(`[SpeedRamp] Energy stats (local calc): mean=${mean.toFixed(4)}, std=${std.toFixed(4)}`);
	}
	
	// Re-process when parameters or audio data change
	$effect(() => {
		// Track all parameters that affect the curve (including audioDuration)
		const _ = [speedRampMinSpeed, speedRampMaxSpeed, speedRampSmoothing, speedRampPunch, analysisData.energy, audioDuration];
		preprocessSpeedCurve();
	});

	// Audio-as-master-clock: sync video to audio time
	let audioMasterEnabled = $state(true); // Toggle for audio-synced playback

	// High-precision time loop for sub-beat synchronization
	function updateTime() {
		if (sharedAudioRef && !sharedAudioRef.paused) {
			audioCurrentTime = sharedAudioRef.currentTime;

			if (audioAnalyzer) {
				const { audioLevel, bassLevel, midLevel, trebleLevel } = audioAnalyzer.getAudioData();
				if (uniforms.u_audioLevel) uniforms.u_audioLevel.value = audioLevel;
				if (uniforms.u_bassLevel) uniforms.u_bassLevel.value = bassLevel;
				if (uniforms.u_midLevel) uniforms.u_midLevel.value = midLevel;
				if (uniforms.u_trebleLevel) uniforms.u_trebleLevel.value = trebleLevel;
			}
			
			// Check beat triggers BEFORE computing frame index.
			// This ensures any clip switch (seekToClip) happens before setAudioTime()
			// computes the frame, eliminating the stale-frame race condition.
			checkBeatTriggers(audioCurrentTime);
			
			// === AUDIO AS MASTER CLOCK ===
			// Sync video frame to audio time (Phase 2 feature)
			if (audioMasterEnabled && shaderPlayerRef) {
				const canUseSpeedRamp = enableSpeedRamping && processedSpeedCurve && processedTimeRemap && speedCurveTimestep > 0;
				
				// Handle transition when speed ramping is toggled
				if (canUseSpeedRamp && !wasSpeedRampingEnabled) {
					// Just turned ON: calculate offset for continuity
					const curveIndex = Math.floor(audioCurrentTime / speedCurveTimestep);
					const clampedIndex = Math.max(0, Math.min(processedTimeRemap.length - 1, curveIndex));
					const rawRemappedTime = processedTimeRemap[clampedIndex];
					// Offset = what we were showing (audioCurrentTime) minus what remap would show
					speedRampTimeOffset = audioCurrentTime - rawRemappedTime;
					// Switch to direct frame mapping for speed ramp mode
					shaderPlayerRef.setDirectFrameMapping(true);
					console.log(`[SpeedRamp] Enabled at audio=${audioCurrentTime.toFixed(2)}s, rawRemap=${rawRemappedTime.toFixed(2)}s, offset=${speedRampTimeOffset.toFixed(2)}s`);
					wasSpeedRampingEnabled = true;
				} else if (!canUseSpeedRamp && wasSpeedRampingEnabled) {
					// Just turned OFF: reset offset and switch back to elapsed-time mapping
					speedRampTimeOffset = 0;
					// Recalculate clipStartRampedTime for elapsed-time mode
					shaderPlayerRef.setDirectFrameMapping(false);
					wasSpeedRampingEnabled = false;
					console.log(`[SpeedRamp] Disabled`);
				}
				
				if (canUseSpeedRamp) {
					// Use pre-processed curves - just lookup, no calculation
					const curveIndex = Math.floor(audioCurrentTime / speedCurveTimestep);
					const clampedIndex = Math.max(0, Math.min(processedSpeedCurve.length - 1, curveIndex));
					
					// Update visual feedback from pre-processed data
					currentSpeed = processedSpeedCurve[clampedIndex];
					// Energy is derived from speed for display (reverse the formula)
					const speedRange = speedRampMaxSpeed - speedRampMinSpeed;
					currentEnergy = speedRange > 0 ? (currentSpeed - speedRampMinSpeed) / speedRange : 0;
					
					// Use pre-computed time remap + offset for smooth transition
					const remappedTime = processedTimeRemap[clampedIndex] + speedRampTimeOffset;
					
					// Debug: log every second
					if (Math.floor(audioCurrentTime) !== Math.floor(audioCurrentTime - 0.016)) {
						console.log(`[SpeedRamp] audio=${audioCurrentTime.toFixed(2)}s -> video=${remappedTime.toFixed(2)}s (speed=${currentSpeed.toFixed(2)}x)`);
					}
					
					shaderPlayerRef.setAudioTime(remappedTime, TARGET_FPS);
				} else {
					// No speed ramping or no curve - direct sync
					currentSpeed = 1.0;
					currentEnergy = 0;
					shaderPlayerRef.setAudioTime(audioCurrentTime, TARGET_FPS);
				}
			}
			
			// Handle Speed Ramping when NOT using audio master clock (direct speed control)
			if (!audioMasterEnabled && shaderPlayerRef) {
				if (enableSpeedRamping && processedSpeedCurve) {
					const curveIndex = Math.floor(audioCurrentTime / speedCurveTimestep);
					const clampedIndex = Math.max(0, Math.min(processedSpeedCurve.length - 1, curveIndex));
					
					currentSpeed = processedSpeedCurve[clampedIndex];
					const speedRange = speedRampMaxSpeed - speedRampMinSpeed;
					currentEnergy = speedRange > 0 ? (currentSpeed - speedRampMinSpeed) / speedRange : 0;
					
					shaderPlayerRef.setSpeed(currentSpeed);
				} else {
					currentSpeed = 1.0;
					currentEnergy = 0;
					shaderPlayerRef.setSpeed(1.0);
				}
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
	// Video cycling is always enabled (clips auto-swap on beat triggers)
	let lastActiveVideoId = null; // Tracks last video ID to prevent duplicate seekToClip calls

	function resetAudioUniforms() {
		if (uniforms.u_audioLevel) uniforms.u_audioLevel.value = 0;
		if (uniforms.u_bassLevel) uniforms.u_bassLevel.value = 0;
		if (uniforms.u_midLevel) uniforms.u_midLevel.value = 0;
		if (uniforms.u_trebleLevel) uniforms.u_trebleLevel.value = 0;
	}

	async function setupAudioAnalyzer() {
		if (!sharedAudioRef) return;

		if (audioAnalyzer && audioAnalyzer.audioElement !== sharedAudioRef) {
			audioAnalyzer.destroy();
			audioAnalyzer = null;
		}

		if (!audioAnalyzer) {
			audioAnalyzer = new AudioAnalyzer();
			await audioAnalyzer.initializeAudio(null, sharedAudioRef);
		}

		audioAnalyzer.setVolume(audioVolume);
	}

	// --- Frame Buffer State ---
	let isPreloading = $state(false);
	let preloadProgress = $state(0);
	let preloadStatus = $state('');
	let isBufferReady = $state(false);

	// --- Theme State ---
	let themeKey = $state('glass');
	
	// Custom transparent glass theme for Tweakpane
	// Using valid Tweakpane theme variables only
	const glassTheme = {
		baseBorderRadius: '6px',
		baseFontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
		baseShadowColor: 'rgba(0, 0, 0, 0.5)',
		buttonBackgroundColor: 'rgba(90, 63, 192, 0.4)',
		buttonBackgroundColorActive: 'rgba(90, 63, 192, 0.7)',
		buttonBackgroundColorFocus: 'rgba(90, 63, 192, 0.5)',
		buttonBackgroundColorHover: 'rgba(90, 63, 192, 0.6)',
		buttonForegroundColor: 'rgba(255, 255, 255, 0.95)',
		containerBackgroundColor: 'rgba(13, 13, 13, 0.85)',
		containerBackgroundColorActive: 'rgba(20, 20, 20, 0.9)',
		containerBackgroundColorFocus: 'rgba(20, 20, 20, 0.9)',
		containerBackgroundColorHover: 'rgba(25, 25, 25, 0.9)',
		containerForegroundColor: 'rgba(255, 255, 255, 0.8)',
		grooveForegroundColor: 'rgba(90, 63, 192, 0.8)',
		inputBackgroundColor: 'rgba(25, 25, 25, 0.8)',
		inputBackgroundColorActive: 'rgba(35, 35, 35, 0.9)',
		inputBackgroundColorFocus: 'rgba(35, 35, 35, 0.9)',
		inputBackgroundColorHover: 'rgba(30, 30, 30, 0.85)',
		inputForegroundColor: 'rgba(255, 255, 255, 0.9)',
		labelForegroundColor: 'rgba(168, 130, 255, 0.9)',
		monitorBackgroundColor: 'rgba(20, 20, 20, 0.8)',
		monitorForegroundColor: 'rgba(168, 130, 255, 0.95)',
	};
	
	// Extend presets with custom theme
	const customThemes = {
		...ThemeUtils.presets,
		glass: glassTheme
	};

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

	/**
	 * Post-process structure sections to fix bad API detection
	 * If sections are too short, empty, or unrealistic, generate reasonable sections
	 */
	function postProcessSections(structure, duration) {
		if (!structure || !structure.sections || !duration) {
			return { sections: [], boundaries: [] };
		}
		
		const sections = structure.sections;
		
		// Check if sections are valid (not too short, not empty)
		const hasValidSections = sections.some(s => 
			s.duration > 5 && // At least 5 seconds
			s.end > s.start && // Actual duration
			s.start >= 0
		);
		
		if (hasValidSections) {
			// Filter out invalid sections (0 duration, negative, etc.)
			const validSections = sections.filter(s => 
				s.duration > 1 && s.end > s.start && s.start >= 0
			);
			
			if (validSections.length > 0) {
				console.log('[VideoWorkbench] Using API sections (valid)');
				return {
					sections: validSections,
					boundaries: validSections.map(s => s.start).concat([validSections[validSections.length - 1].end])
				};
			}
		}
		
		// Generate fallback sections based on song duration
		console.log('[VideoWorkbench] API sections invalid, generating fallback sections');
		
		// Create reasonable sections based on typical song structure
		const fallbackSections = [];
		const boundaries = [0];
		
		// Intro: first 10% or 15s, whichever is smaller
		const introEnd = Math.min(duration * 0.1, 15);
		if (introEnd > 5) {
			fallbackSections.push({
				start: 0,
				end: introEnd,
				label: 'intro',
				duration: introEnd,
				energy: 0
			});
			boundaries.push(introEnd);
		}
		
		// Main body: split into verse/chorus alternating
		const mainStart = introEnd;
		const outroStart = duration - Math.min(duration * 0.15, 20); // Last 15% or 20s
		const mainDuration = outroStart - mainStart;
		
		if (mainDuration > 20) {
			// Divide main section into 4-6 parts alternating verse/chorus
			const numParts = Math.floor(mainDuration / 30); // ~30s per section
			const partDuration = mainDuration / numParts;
			
			for (let i = 0; i < numParts; i++) {
				const start = mainStart + (i * partDuration);
				const end = mainStart + ((i + 1) * partDuration);
				const label = i % 2 === 0 ? 'verse' : 'chorus';
				
				fallbackSections.push({
					start,
					end,
					label,
					duration: end - start,
					energy: 0
				});
				boundaries.push(end);
			}
		} else {
			// Short main section, just one part
			fallbackSections.push({
				start: mainStart,
				end: outroStart,
				label: 'verse',
				duration: mainDuration,
				energy: 0
			});
			boundaries.push(outroStart);
		}
		
		// Outro
		if (duration - outroStart > 5) {
			fallbackSections.push({
				start: outroStart,
				end: duration,
				label: 'outro',
				duration: duration - outroStart,
				energy: 0
			});
			boundaries.push(duration);
		}
		
		return {
			sections: fallbackSections,
			boundaries
		};
	}
	
	async function onAudioSelected(event) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;

		if (audioAnalyzer) {
			audioAnalyzer.destroy();
			audioAnalyzer = null;
			resetAudioUniforms();
		}

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
			
			// Post-process structure sections to fix bad API detection
			const processedStructure = postProcessSections(result.structure, result.duration);
			
			// Update analysis data with result from API
			analysisData = {
				bpm: result.bpm,
				beats: result.beats || [],
				onsets: result.onsets || [], // critical for transients
				energy: result.energy, // Contains curve for speed ramping
				confidence: result.confidence,
				structure: processedStructure // Use post-processed sections
			};
			
			console.log(`[VideoWorkbench] Analysis applied: ${analysisData.onsets.length} onsets, ${analysisData.bpm} BPM`);
			console.log(`[VideoWorkbench] Structure: ${analysisData.structure.sections?.length || 0} sections detected`);
			console.log('[DEBUG] Raw structure data:', JSON.stringify(result.structure, null, 2));
			console.log('[DEBUG] Processed structure data:', JSON.stringify(processedStructure, null, 2));
			
		} catch (err) {
			console.error("[VideoWorkbench] ❌ Essentia analysis failed:", err);
			// Fallback or empty data
			analysisData = { bpm: 0, beats: [], onsets: [], structure: { sections: [], boundaries: [] }, energy: null };
		} finally {
			isAnalyzingAudio = false;
		}
		
		// Audio set up logic simplified - strictly Essentia + Peaks
		if (sharedAudioRef) {
			// Revoke old blob URL if exists to prevent memory leak
			if (audioFileUrl) {
				URL.revokeObjectURL(audioFileUrl);
			}
			
			// Create and store new blob URL
			audioFileUrl = URL.createObjectURL(file);
			sharedAudioRef.src = audioFileUrl;
			sharedAudioRef.volume = audioVolume;
			// Ensure we catch the duration
			sharedAudioRef.onloadedmetadata = () => {
				audioDuration = sharedAudioRef.duration;
			};
		}

		await setupAudioAnalyzer();
	}

	/* === Phase 4: Unified Trigger System === */
	
// Trigger modes
let enableJumpCuts = $state(false); // Random frame jump on marker hit
let enableGlitchMode = $state(false); // Rapid micro-jumps in high-energy sections
let enableFXTriggers = $state(false); // Shader parameter spikes on marker
	
	// Jump cut settings
	let jumpCutRange = $state(30); // Max frames to jump (random within range)
	
	// Glitch mode settings
	let glitchFrameRange = $state(5); // 1-5 frame micro-jumps
	let glitchEnergyThreshold = $state(0.7); // Energy level to trigger glitch mode
	
	// FX trigger settings
	let fxTriggerIntensity = $state(0.5); // How much to spike shader params
	let fxTriggerDecay = $state(0.1); // How fast the spike decays (seconds)
	let fxTriggerActive = $state(0); // Current FX trigger level (0-1)
	
	let previousTime = 0;
	let nextMarkerIndex = $state(0);
	let previousTriggersLength = 0; // Track triggers array changes
	
	const findNextMarkerIndex = (triggers, time) => {
		const nextIndex = triggers.findIndex(marker => marker > time);
		return nextIndex === -1 ? triggers.length : nextIndex;
	};
	
	/**
	 * Check for beat triggers and fire clip switches, jump cuts, FX spikes, etc.
	 * Called directly from updateTime() BEFORE setAudioTime() to ensure clip
	 * switches are atomic with frame calculation (no stale-frame race condition).
	 * @param {number} time - Current audio time in seconds
	 */
	function checkBeatTriggers(time) {
		const triggers = filteredOnsets;
		
		// Reset tracking on seek or pause (approximate)
		if (!isPlaying || time < previousTime || Math.abs(time - previousTime) > 1.0) {
			previousTime = time;
			nextMarkerIndex = findNextMarkerIndex(triggers, time);
			return;
		}
		
		if (time > previousTime) {
			// Debug: log every ~1 second to avoid spam
			if (Math.floor(time) !== Math.floor(previousTime)) {
				console.log(`[Trigger] time=${time.toFixed(2)}, triggers=${triggers.length}`);
			}
			
			while (nextMarkerIndex < triggers.length) {
				const marker = triggers[nextMarkerIndex];
				if (marker > time) {
					break;
				}
				if (marker <= previousTime) {
					nextMarkerIndex++;
					continue;
				}
				
				isBeatActive = true;
				markerCounter++;
				setTimeout(() => isBeatActive = false, 100); // Visual blink duration
				
				// === TRIGGER: Video Swap (always active) ===
				if (markerCounter >= markerSwapThreshold) {
					console.log(`[VideoWorkbench] Video swap triggered! Counter: ${markerCounter}/${markerSwapThreshold}`);
					nextVideo();
					markerCounter = 0;
				}
				
				// === TRIGGER: Jump Cut ===
				if (enableJumpCuts && shaderPlayerRef) {
					const jumpAmount = Math.floor(Math.random() * jumpCutRange * 2) - jumpCutRange;
					shaderPlayerRef.jumpFrames(jumpAmount);
				}
				
				// === TRIGGER: FX Spike ===
				if (enableFXTriggers) {
					fxTriggerActive = 1.0; // Full spike
				}
				
				// === TRIGGER: Glitch Mode (high-energy micro-jumps) ===
				if (enableGlitchMode && shaderPlayerRef) {
					// Check if we're in a high-energy section
					const sectionEnergy = currentSection.energy || 0;
					const isHighEnergy = sectionEnergy > glitchEnergyThreshold;
					
					if (isHighEnergy) {
						// Rapid micro-jumps
						const microJump = Math.floor(Math.random() * glitchFrameRange * 2) - glitchFrameRange;
						shaderPlayerRef.jumpFrames(microJump);
					}
				}
				
				nextMarkerIndex++;
			}
		}
		previousTime = time;
	}
	
	// Reset trigger cursor when filteredOnsets changes (density slider, MIDI toggle, etc.)
	$effect(() => {
		const triggers = filteredOnsets; // Track for reactivity
		if (triggers.length !== previousTriggersLength) {
			previousTriggersLength = triggers.length;
			nextMarkerIndex = findNextMarkerIndex(triggers, audioCurrentTime);
			console.log(`[Trigger] Triggers changed (${triggers.length}), reset cursor to ${nextMarkerIndex}`);
		}
	});
	
	// FX trigger decay effect
	$effect(() => {
		if (fxTriggerActive > 0 && isPlaying) {
			const decayPerFrame = fxTriggerDecay / (1000 / 60); // Decay per ~16ms frame
			const interval = setInterval(() => {
				fxTriggerActive = Math.max(0, fxTriggerActive - decayPerFrame);
				if (fxTriggerActive <= 0) {
					clearInterval(interval);
				}
			}, 16);
			return () => clearInterval(interval);
		}
	});
	
	// Apply FX trigger to shader uniforms
	$effect(() => {
		if (uniforms) {
			if (fxTriggerActive > 0) {
				// Spike certain shader params based on trigger level
				const spikeAmount = fxTriggerActive * fxTriggerIntensity;
				
				// Spike noise and RGB shift on VHS shader (add to base value)
				if (uniforms.u_noise) {
					uniforms.u_noise.value = Math.min(0.5, baseNoiseValue + spikeAmount * 0.3);
				}
				if (uniforms.u_rgbShift) {
					uniforms.u_rgbShift.value = Math.min(0.02, baseRgbShiftValue + spikeAmount * 0.01);
				}
			} else {
				// Return to base values when no trigger active
				if (uniforms.u_noise) {
					uniforms.u_noise.value = baseNoiseValue;
				}
				if (uniforms.u_rgbShift) {
					uniforms.u_rgbShift.value = baseRgbShiftValue;
				}
			}
		}
	});
	
	// Update base values when sliders change (only when FX not active)
	function handleNoiseChange() {
		if (fxTriggerActive === 0) {
			baseNoiseValue = uniforms.u_noise.value;
		}
	}
	
	function handleRgbShiftChange() {
		if (fxTriggerActive === 0) {
			baseRgbShiftValue = uniforms.u_rgbShift.value;
		}
	}

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

	function restartPlayback() {
		// If a section loop is active, restart to the beginning of that section
		// Otherwise restart to the beginning of the song
		let targetTime = 0;
		
		if (loopSectionIndex >= 0 && analysisData.structure?.sections) {
			const section = analysisData.structure.sections[loopSectionIndex];
			if (section) {
				targetTime = section.start;
				console.log(`[VideoWorkbench] Restarting to section: ${section.label} at ${targetTime}s`);
			}
		} else {
			console.log('[VideoWorkbench] Restarting to beginning of song');
		}
		
		// Update audio position
		if (sharedAudioRef) {
			sharedAudioRef.currentTime = targetTime;
		}
		audioCurrentTime = targetTime;
		
		// Sync video position
		if (shaderPlayerRef && audioMasterEnabled) {
			shaderPlayerRef.setAudioTime(targetTime, TARGET_FPS);
		}
		
		// Reset marker tracking
		previousTime = targetTime;
		nextMarkerIndex = findNextMarkerIndex(filteredOnsets, targetTime);
		markerCounter = 0;
	}

	async function onFileSelected(event) {
		const files = Array.from(event.currentTarget.files || []);
		if (files.length === 0) return;

		console.log('[VideoWorkbench] Processing', files.length, 'video files');
		
		// Filter out duplicates (by name and size)
		const existingFiles = new Set($videoAssets.map(a => `${a.name}-${a.file?.size || 0}`));
		const newFiles = files.filter(f => !existingFiles.has(`${f.name}-${f.size}`));
		
		if (newFiles.length < files.length) {
			console.log(`[VideoWorkbench] Filtered out ${files.length - newFiles.length} duplicate files`);
		}
		
		if (newFiles.length === 0) {
			console.log('[VideoWorkbench] No new files to add');
			if (fileInput) fileInput.value = '';
			return;
		}
		
		// Add to asset list for thumbnails
		for (const file of newFiles) {
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
			const result = await frameBuffer.preloadClips(allFiles, (progress, status) => {
				preloadProgress = progress;
				preloadStatus = status;
			});
			
			// Remove failed videos from asset list to keep indices in sync with frame buffer
			if (result?.failedIndices?.length > 0) {
				console.warn(`[VideoWorkbench] Removing ${result.failedIndices.length} failed videos from asset list`);
				const failedSet = new Set(result.failedIndices);
				videoAssets.update(assets => assets.filter((_, idx) => !failedSet.has(idx)));
				
				// Reset active video if it was removed
				if ($activeVideo && failedSet.has($videoAssets.findIndex(a => a.id === $activeVideo.id))) {
					activeVideo.set($videoAssets[0] || null);
				}
			}
			
			isBufferReady = true;
			preloadProgress = 1;
			console.log('[VideoWorkbench] Frame buffer ready:', frameBuffer.totalFrames, 'frames across', frameBuffer.clips.size, 'clips');
			
			// Prime first frame on-demand (don't wait, let ShaderPlayer handle it)
			frameBuffer.primeAroundFrame(0);
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

	/**
	 * Check if speed ramping is currently active.
	 * Used by seekToClip callers to tell ShaderPlayer which frame mapping mode to use.
	 */
	function isSpeedRampActive() {
		return enableSpeedRamping && audioMasterEnabled && processedTimeRemap && speedCurveTimestep > 0;
	}

	// Video cycling functionality - now uses section-constrained pools
	function nextVideo() {
		if (!shaderPlayerRef || $videoAssets.length <= 1) return;
		
		// Get videos available in current section
		const availableVideos = currentSectionVideos;
		if (availableVideos.length === 0) return;
		
		// Find current video in the available pool
		const currentPoolIndex = availableVideos.findIndex(asset => asset.id === $activeVideo?.id);
		const nextPoolIndex = (currentPoolIndex + 1) % availableVideos.length;
		const nextVid = availableVideos[nextPoolIndex];
		
		// Find the global index for seekToClip
		const globalIndex = $videoAssets.findIndex(asset => asset.id === nextVid.id);
		
		// Update lastActiveVideoId BEFORE setting activeVideo to prevent the
		// reactive $effect from firing a duplicate seekToClip (which causes
		// a glitch frame from the timing difference between the two calls)
		lastActiveVideoId = nextVid.id;
		activeVideo.set(nextVid);
		// Pass current audio time; tell ShaderPlayer if speed ramp is active for frame mapping
		shaderPlayerRef.seekToClip(globalIndex, audioCurrentTime, isSpeedRampActive());
	}

	function previousVideo() {
		if (!shaderPlayerRef || $videoAssets.length <= 1) return;
		
		// Get videos available in current section
		const availableVideos = currentSectionVideos;
		if (availableVideos.length === 0) return;
		
		const currentPoolIndex = availableVideos.findIndex(asset => asset.id === $activeVideo?.id);
		const prevPoolIndex = currentPoolIndex === 0 ? availableVideos.length - 1 : currentPoolIndex - 1;
		const prevVid = availableVideos[prevPoolIndex];
		
		const globalIndex = $videoAssets.findIndex(asset => asset.id === prevVid.id);
		
		// Update lastActiveVideoId BEFORE setting activeVideo to prevent duplicate seekToClip
		lastActiveVideoId = prevVid.id;
		activeVideo.set(prevVid);
		// Pass current audio time; tell ShaderPlayer if speed ramp is active for frame mapping
		shaderPlayerRef.seekToClip(globalIndex, audioCurrentTime, isSpeedRampActive());
	}

	$effect(() => {
		if (!$activeVideo) {
			lastActiveVideoId = null;
			return;
		}

		if (!shaderPlayerRef || $videoAssets.length === 0) return;
		if ($activeVideo.id === lastActiveVideoId) return;

		const globalIndex = $videoAssets.findIndex((asset) => asset.id === $activeVideo.id);
		if (globalIndex < 0) return;

		lastActiveVideoId = $activeVideo.id;
		shaderPlayerRef.seekToClip(globalIndex, audioCurrentTime, isSpeedRampActive());
	});

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

	// Anamorphic Breathe state variables
	let chromaticEnabled = $state(true);
	let defocusEnabled = $state(true);
	let chromaticStyle = $state(1); // 0 = circular, 1 = horizontal wave
	let breatheSync = $state(true);

	// Sync checkbox state to uniforms
	$effect(() => {
		uniforms.u_chromatic_enable.value = chromaticEnabled ? 1.0 : 0.0;
	});
	$effect(() => {
		uniforms.u_defocus_enable.value = defocusEnabled ? 1.0 : 0.0;
	});
	$effect(() => {
		uniforms.u_chromatic_style.value = chromaticStyle;
	});
	$effect(() => {
		uniforms.u_breathe_sync.value = breatheSync ? 1.0 : 0.0;
	});

	// Anamorphic Breathe presets
	function applyAnamorphicPreset(preset) {
		switch (preset) {
			case 'subtle':
				chromaticEnabled = true;
				defocusEnabled = true;
				uniforms.u_chromatic_amount.value = 0.2;
				uniforms.u_chromatic_speed.value = 0.5;
				chromaticStyle = 1;
				uniforms.u_defocus_amount.value = 0.15;
				uniforms.u_defocus_speed.value = 0.3;
				uniforms.u_anamorphic_ratio.value = 1.3;
				uniforms.u_breathe_intensity.value = 0.6;
				breatheSync = true;
				break;
			case 'dreamy':
				chromaticEnabled = true;
				defocusEnabled = true;
				uniforms.u_chromatic_amount.value = 0.5;
				uniforms.u_chromatic_speed.value = 0.6;
				chromaticStyle = 1;
				uniforms.u_defocus_amount.value = 0.5;
				uniforms.u_defocus_speed.value = 0.4;
				uniforms.u_anamorphic_ratio.value = 1.5;
				uniforms.u_breathe_intensity.value = 1.0;
				breatheSync = true;
				break;
			case 'trippy':
				chromaticEnabled = true;
				defocusEnabled = true;
				uniforms.u_chromatic_amount.value = 1.2;
				uniforms.u_chromatic_speed.value = 1.5;
				chromaticStyle = 0; // circular for trippy
				uniforms.u_defocus_amount.value = 0.3;
				uniforms.u_defocus_speed.value = 0.8;
				uniforms.u_anamorphic_ratio.value = 1.8;
				uniforms.u_breathe_intensity.value = 1.5;
				breatheSync = false; // async for more chaos
				break;
			case 'cinematic':
				chromaticEnabled = true;
				defocusEnabled = true;
				uniforms.u_chromatic_amount.value = 0.3;
				uniforms.u_chromatic_speed.value = 0.4;
				chromaticStyle = 1;
				uniforms.u_defocus_amount.value = 0.7;
				uniforms.u_defocus_speed.value = 0.25;
				uniforms.u_anamorphic_ratio.value = 2.0;
				uniforms.u_breathe_intensity.value = 0.8;
				breatheSync = true;
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
				<!-- Section Indicator -->
				<div class="section-indicator">
					<span class="section-label">{currentSection.label.toUpperCase()}</span>
					{#if currentSection.end > currentSection.start}
						<div class="section-progress-bar">
							<div 
								class="section-progress-fill"
								style="width: {Math.min(100, ((audioCurrentTime - currentSection.start) / (currentSection.end - currentSection.start)) * 100)}%"
							></div>
						</div>
					{/if}
				</div>
				<div class="beat-indicator-row">
					<div class="beat-label">Beat Trigger:</div>
					<div class="beat-light" class:active={isBeatActive}></div>
				</div>
				<div class="beat-info">
					{markerCounter} / {markerSwapThreshold}
				</div>
				
				<!-- Speed Ramping Meter -->
				{#if enableSpeedRamping && processedSpeedCurve}
					<div class="speed-meter-container">
						<div class="speed-meter-row">
							<span class="speed-label">Speed:</span>
							<span class="speed-value" class:fast={currentSpeed > 1.5} class:slow={currentSpeed < 0.8}>
								{currentSpeed.toFixed(2)}x
							</span>
						</div>
						<div class="speed-bar-track">
							<div 
								class="speed-bar-fill"
								style="width: {Math.min(100, ((currentSpeed - speedRampMinSpeed) / (speedRampMaxSpeed - speedRampMinSpeed)) * 100)}%"
							></div>
						</div>
						<div class="energy-meter-row">
							<span class="energy-label">Energy:</span>
							<div class="energy-bar-track">
								<div 
									class="energy-bar-fill"
									style="width: {currentEnergy * 100}%"
								></div>
							</div>
							<span class="energy-value">{(currentEnergy * 100).toFixed(0)}%</span>
						</div>
					</div>
				{:else if enableSpeedRamping}
					<div class="speed-meter-container">
						<div class="info-text" style="font-size: 11px; color: #888; text-align: center;">
							⏳ Waiting for energy curve...
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<div class="unified-controls">
			<Tweakpane.Pane title="Video Shader" theme={customThemes[themeKey]}>
				<!-- Theme Picker -->
				<Tweakpane.List
					bind:value={themeKey}
					label="Theme"
					options={Object.keys(customThemes)}
				/>

				<!-- Filter Toggle -->
				<Tweakpane.Checkbox
					bind:value={filtersEnabled}
					label="Enable Filters"
				/>

				<Tweakpane.Separator />
				
				<Tweakpane.List
					bind:value={selectedShaderName}
					label="Shader"
					options={{
						VHS: 'VHS',
						XlsczN: 'XlsczN',
						Water: 'Water',
						ChromaticAberration: 'ChromaticAberration',
						Glitch: 'Glitch',
						Noise: 'Noise',
						Vignette: 'Vignette',
						Bloom: 'Bloom',
						DepthOfField: 'DepthOfField',
						Depth: 'Depth',
						Sepia: 'Sepia',
						Scanline: 'Scanline',
						Pixelation: 'Pixelation',
						DotScreen: 'DotScreen',
						HueSaturation: 'HueSaturation',
						BrightnessContrast: 'BrightnessContrast',
						ColorDepth: 'ColorDepth',
						ColorAverage: 'ColorAverage',
						TiltShift: 'TiltShift',
						ToneMapping: 'ToneMapping',
						ASCII: 'ASCII',
						Grid: 'Grid',
						LensFlare: 'LensFlare',
						CRT: 'CRT',
						AnamorphicBreathe: 'AnamorphicBreathe',
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
						
						
						<!-- Density Controls -->
						<Tweakpane.Folder title="Marker Density" expanded={true}>
							<Tweakpane.Slider
								bind:value={onsetDensity}
								label="Onset Density"
								min={0.1}
								max={1.0}
								step={0.05}
							/>
							
							<Tweakpane.Slider
								bind:value={midiDensity}
								label="MIDI Density"
								min={0.1}
								max={1.0}
								step={0.05}
							/>
							
							<Tweakpane.Checkbox
								bind:value={enableRandomSkip}
								label="Random Skip"
							/>
							
							{#if enableRandomSkip}
							<Tweakpane.Slider
								bind:value={randomSkipChance}
								label="Skip Chance"
								min={0.0}
								max={0.5}
								step={0.05}
							/>
							{/if}
						</Tweakpane.Folder>
						
						<Tweakpane.Checkbox
							bind:value={showGrid}
							label="Show 1/32 Grid"
						/>

					{/if}
				</Tweakpane.Folder>

				<!-- Section Video Pools (Phase 3) -->
				{#if analysisData.structure?.sections?.length > 0}
				<Tweakpane.Folder title="Section Video Pools" expanded={false}>
					<div class="section-pools-info">
						Assign videos to song sections. During playback, video cycling is restricted to the current section's pool.
					</div>
					{#each analysisData.structure.sections as section, sectionIndex}
						<div class="section-pool-row">
							<div class="section-pool-label">
								<span class="section-name">{section.label}</span>
								<span class="section-time">{formatSectionTime(section.start)} - {formatSectionTime(section.end)}</span>
							</div>
							<div class="section-pool-videos">
								{#each $videoAssets as asset, videoIndex}
									<label class="video-pool-checkbox">
										<input 
											type="checkbox" 
											checked={isVideoInSection(sectionIndex, videoIndex)}
											onchange={() => toggleVideoInSection(sectionIndex, videoIndex)}
										/>
										<span class="video-pool-name">{videoIndex + 1}</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}
				</Tweakpane.Folder>
				{/if}

				<!-- Triggers & Effects Folder (Phase 4 & 5) -->
				<Tweakpane.Folder title="Triggers & Effects" expanded={false}>
					<!-- Video Cycling -->
					<Tweakpane.Folder title="Video Cycling" expanded={true}>
						<Tweakpane.Slider
							bind:value={markerSwapThreshold}
							label="Swap Every N Markers"
							min={1}
							max={16}
							step={1}
						/>
					</Tweakpane.Folder>
					
					<Tweakpane.Separator />
					
					<!-- Speed Ramping -->
					<Tweakpane.Folder title="Speed Ramping" expanded={false}>
						<Tweakpane.Checkbox
							bind:value={enableSpeedRamping}
							label="Enable Speed Ramping"
						/>
						<Tweakpane.Slider
							bind:value={speedRampMinSpeed}
							label="Min Speed"
							min={0.25}
							max={1.5}
							step={0.05}
						/>
						<Tweakpane.Slider
							bind:value={speedRampMaxSpeed}
							label="Max Speed"
							min={0.5}
							max={3.0}
							step={0.1}
						/>
						<Tweakpane.Slider
							bind:value={speedRampSmoothing}
							label="Smoothing"
							min={0}
							max={0.5}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={speedRampPunch}
							label="Punch"
							min={0.5}
							max={3.0}
							step={0.1}
						/>
						<div class="speed-range-info">
							{#if processedSpeedCurve}
								✅ Pre-processed: {speedRampMinSpeed.toFixed(2)}x → {speedRampMaxSpeed.toFixed(2)}x
							{:else if analysisData.energy?.curve}
								⏳ Processing energy curve...
							{:else}
								⚠️ Load audio for energy curve
							{/if}
						</div>
					</Tweakpane.Folder>
					
					<Tweakpane.Separator />
					
					<!-- Jump Cuts -->
					<Tweakpane.Checkbox
						bind:value={enableJumpCuts}
						label="Jump Cuts"
					/>
					<Tweakpane.Slider
						bind:value={jumpCutRange}
						label="Jump Range"
						min={5}
						max={120}
						step={5}
					/>
					
					<Tweakpane.Separator />
					
					<!-- Glitch Mode -->
					<Tweakpane.Checkbox
						bind:value={enableGlitchMode}
						label="Glitch Mode"
					/>
					<Tweakpane.Slider
						bind:value={glitchFrameRange}
						label="Glitch Frames"
						min={1}
						max={15}
						step={1}
					/>
					<Tweakpane.Slider
						bind:value={glitchEnergyThreshold}
						label="Energy Threshold"
						min={0.1}
						max={1.0}
						step={0.05}
					/>
					
					<Tweakpane.Separator />
					
					<!-- FX Triggers -->
					<Tweakpane.Checkbox
						bind:value={enableFXTriggers}
						label="FX Triggers"
					/>
					<Tweakpane.Slider
						bind:value={fxTriggerIntensity}
						label="FX Intensity"
						min={0.1}
						max={1.0}
						step={0.05}
					/>
					<Tweakpane.Slider
						bind:value={fxTriggerDecay}
						label="FX Decay"
						min={0.01}
						max={0.5}
						step={0.01}
					/>
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
							on:change={handleRgbShiftChange}
						/>

						<Tweakpane.Slider
							bind:value={uniforms.u_noise.value}
							label="Noise"
							min={0}
							max={0.5}
							step={0.01}
							on:change={handleNoiseChange}
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

				{#if selectedShaderName === 'AnamorphicBreathe'}
					<Tweakpane.Folder title="Anamorphic Breathe Presets" expanded={true}>
						<div class="preset-buttons">
							<Button title="Subtle" on:click={() => applyAnamorphicPreset('subtle')} />
							<Button title="Dreamy" on:click={() => applyAnamorphicPreset('dreamy')} />
							<Button title="Trippy" on:click={() => applyAnamorphicPreset('trippy')} />
							<Button title="Cinematic" on:click={() => applyAnamorphicPreset('cinematic')} />
						</div>
					</Tweakpane.Folder>

					<Tweakpane.Folder title="Chromatic Undulation" expanded={true}>
						<Tweakpane.Checkbox
							bind:value={chromaticEnabled}
							label="Enable Chromatic"
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_chromatic_amount.value}
							label="Amount"
							min={0}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_chromatic_speed.value}
							label="Speed"
							min={0.1}
							max={3}
							step={0.1}
						/>
						<Tweakpane.List
							bind:value={chromaticStyle}
							label="Style"
							options={{
								'Circular': 0,
								'Horizontal Wave': 1
							}}
						/>
					</Tweakpane.Folder>

					<Tweakpane.Folder title="Anamorphic Defocus" expanded={true}>
						<Tweakpane.Checkbox
							bind:value={defocusEnabled}
							label="Enable Defocus"
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_defocus_amount.value}
							label="Amount"
							min={0}
							max={1}
							step={0.01}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_defocus_speed.value}
							label="Speed"
							min={0.1}
							max={2}
							step={0.1}
						/>
						<Tweakpane.Slider
							bind:value={uniforms.u_anamorphic_ratio.value}
							label="Anamorphic Ratio"
							min={1}
							max={2.5}
							step={0.1}
						/>
					</Tweakpane.Folder>

					<Tweakpane.Folder title="Master Controls" expanded={true}>
						<Tweakpane.Slider
							bind:value={uniforms.u_breathe_intensity.value}
							label="Intensity"
							min={0}
							max={2}
							step={0.01}
						/>
						<Tweakpane.Checkbox
							bind:value={breatheSync}
							label="Sync Effects"
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
			
			<!-- Section Loop Dropdown -->
			{#if analysisData.structure?.sections?.length > 0}
				<div class="section-loop-controls">
					<label class="section-loop-label" for="section-loop-select">Loop Section:</label>
					<select 
						id="section-loop-select"
						class="section-loop-dropdown"
						bind:value={loopSectionIndex}
						onchange={handleSectionLoopChange}
					>
						<option value={-1}>None (No Loop)</option>
						{#each analysisData.structure.sections as section, i}
							<option value={i}>{section.label.toUpperCase()} ({formatSectionTime(section.start)} - {formatSectionTime(section.end)})</option>
						{/each}
					</select>
					{#if loopSectionIndex >= 0}
						<span class="loop-active-indicator">🔁 Looping</span>
					{/if}
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
				sections={analysisData.structure?.sections || []}
				loopSectionIndex={loopSectionIndex}
				grid={gridMarkers}
				onRestart={restartPlayback}
				onNextVideo={nextVideo}
				onSeek={(time) => {
					// Sync audio position
					if (audioAnalyzer) audioAnalyzer.seekTo(time);
					else {
						audioCurrentTime = time;
					}
					// Sync video position to match audio (Phase 2 seek sync)
					if (shaderPlayerRef && audioMasterEnabled) {
						shaderPlayerRef.setAudioTime(time, TARGET_FPS);
					}
				}}
			/>
		</div>
		
		<!-- Thumbnail Gallery (moved here from sidebar) -->
		{#if $videoAssets.length > 0}
			<div class="thumbnail-gallery-main">
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
		{/if}
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
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background-color: #333;
        border: 1px solid #555;
        transition: all 0.05s ease;
        transform: scale(1);
    }
    .beat-light.active {
        background-color: #00ff88;
        box-shadow: 0 0 12px #00ff88, 0 0 24px rgba(0, 255, 136, 0.5);
        border-color: #00ff88;
        animation: beat-pulse 0.1s ease-out;
    }
    
    @keyframes beat-pulse {
        0% {
            transform: scale(1.4);
            box-shadow: 0 0 20px #00ff88, 0 0 40px rgba(0, 255, 136, 0.8);
        }
        100% {
            transform: scale(1);
            box-shadow: 0 0 12px #00ff88, 0 0 24px rgba(0, 255, 136, 0.5);
        }
    }

	/* Speed Ramping Meter */
	.speed-meter-container {
		margin-top: 12px;
		padding: 8px;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 4px;
		border: 1px solid #333;
	}

	.speed-meter-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.speed-label {
		font-size: 11px;
		color: #888;
	}

	.speed-value {
		font-family: 'SF Mono', monospace;
		font-size: 14px;
		font-weight: 600;
		color: #00aaff;
		transition: color 0.1s;
	}

	.speed-value.fast {
		color: #ff6600;
	}

	.speed-value.slow {
		color: #00ff88;
	}

	.speed-bar-track {
		position: relative;
		height: 8px;
		background: #222;
		border-radius: 4px;
		overflow: visible;
		margin-bottom: 8px;
	}

	.speed-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #00aaff, #ff6600);
		border-radius: 4px;
		transition: width 0.05s linear;
	}

	.energy-meter-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.energy-label {
		font-size: 10px;
		color: #666;
		min-width: 40px;
	}

	.energy-bar-track {
		flex: 1;
		height: 6px;
		background: #222;
		border-radius: 3px;
		overflow: hidden;
	}

	.energy-bar-fill {
		height: 100%;
		background: linear-gradient(90deg, #333, #00ff88, #ffff00, #ff6600);
		transition: width 0.05s linear;
	}

	.energy-value {
		font-family: 'SF Mono', monospace;
		font-size: 10px;
		color: #666;
		min-width: 30px;
		text-align: right;
	}

	.speed-range-info {
		font-size: 11px;
		color: #a882ff;
		text-align: center;
		padding: 4px;
		background: rgba(90, 63, 192, 0.15);
		border-radius: 3px;
		margin: 4px 0;
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
		flex-direction: column;
		gap: 8px;
	}

	.section-indicator {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
	}

	.section-label {
		font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
		font-size: 0.7rem;
		font-weight: 600;
		color: #a882ff;
		letter-spacing: 1.5px;
		min-width: 60px;
		text-align: center;
		background: rgba(90, 63, 192, 0.2);
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid rgba(90, 63, 192, 0.4);
	}

	.section-progress-bar {
		flex: 1;
		height: 4px;
		background: #222;
		border-radius: 2px;
		overflow: hidden;
	}

	.section-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #5a3fc0, #a882ff);
		border-radius: 2px;
		transition: width 0.1s linear;
	}

	/* Section Video Pools UI */
	.section-pools-info {
		font-size: 0.7rem;
		color: #888;
		margin-bottom: 10px;
		line-height: 1.4;
	}

	.section-pool-row {
		margin-bottom: 12px;
		padding: 8px;
		background: rgba(30, 30, 30, 0.6);
		border-radius: 4px;
	}

	.section-pool-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 6px;
	}

	.section-name {
		font-size: 0.75rem;
		font-weight: 600;
		color: #a882ff;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.section-time {
		font-size: 0.65rem;
		color: #666;
		font-family: monospace;
	}

	.section-pool-videos {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.video-pool-checkbox {
		display: flex;
		align-items: center;
		gap: 3px;
		cursor: pointer;
		padding: 3px 6px;
		background: rgba(40, 40, 40, 0.8);
		border-radius: 3px;
		font-size: 0.7rem;
		transition: all 0.15s;
	}

	.video-pool-checkbox:hover {
		background: rgba(60, 60, 60, 0.8);
	}

	.video-pool-checkbox input[type="checkbox"] {
		width: 12px;
		height: 12px;
		accent-color: #a882ff;
	}

	.video-pool-name {
		color: #ccc;
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

	/* Section Loop Controls */
	.section-loop-controls {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
		padding: 8px 12px;
		background: #1a1a1a;
		border-radius: 6px;
		border: 1px solid #333;
	}

	.section-loop-label {
		font-size: 0.8rem;
		color: #888;
		white-space: nowrap;
	}

	.section-loop-dropdown {
		flex: 1;
		max-width: 300px;
		padding: 6px 10px;
		background: #2a2a2a;
		border: 1px solid #444;
		border-radius: 4px;
		color: #fff;
		font-size: 0.8rem;
		cursor: pointer;
	}

	.section-loop-dropdown:hover {
		border-color: #666;
	}

	.section-loop-dropdown:focus {
		outline: none;
		border-color: #a882ff;
	}

	.loop-active-indicator {
		font-size: 0.75rem;
		color: #00ff88;
		padding: 4px 8px;
		background: rgba(0, 255, 136, 0.15);
		border-radius: 4px;
		border: 1px solid rgba(0, 255, 136, 0.3);
		animation: pulse-loop 1.5s ease-in-out infinite;
	}

	@keyframes pulse-loop {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.6; }
	}

	/* Thumbnail Gallery in Main Area */
	.thumbnail-gallery-main {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 10px;
		margin-top: 1rem;
		padding: 10px;
		background: #1a1a1a;
		border-radius: 6px;
		border: 1px solid #333;
	}
</style>
