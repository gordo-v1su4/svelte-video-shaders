<script>
	import * as Tweakpane from 'svelte-tweakpane-ui';
	import { ThemeUtils } from 'svelte-tweakpane-ui';
	import Button from 'svelte-tweakpane-ui/Button.svelte';
import ShaderPlayer from '$lib/ShaderPlayer.svelte';
	import WaveformDisplay from '$lib/WaveformDisplay.svelte';
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
	import { AudioAnalyzer } from '$lib/audio-utils.js';
	import { EssentiaService } from '$lib/essentia-service.js';
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
	let audioVolume = $state(0.5);
	let audioIntensity = $state(1.0);
	let audioColorShift = $state(0.5);
	let audioPulseSpeed = $state(1.0);
	let audioWaveAmplitude = $state(0.5);
	let audioReactivePlayback = $state(false);
	let beatSensitivity = $state(0.3);
	let audioFilterIntensity = $state(1.0);
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
		u_grid_lineWidth: { value: 0.0 }
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
			case 'Grayscale': shader = shaders.Grayscale; break;
			default: shader = shaders.Vignette; break;
		}
		console.log('[VideoWorkbench] Selected shader:', selectedShaderName, 'Shader length:', shader?.length || 0);
		return shader;
	});

	// --- Component Refs ---
	let shaderPlayerRef = $state();
	let fileInput;
	let audioInput;

	// --- Playback State ---
	let isPlaying = $state(false);
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

	async function onAudioSelected(event) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;

		audioFile = file;
		isAnalyzingAudio = true;
		
		// Initialize Essentia API FIRST (one-time analysis, no ongoing connection)
		// This sends the file to the server, gets results, then disconnects
		console.log("[VideoWorkbench] 📡 Starting Essentia API analysis (one-time request, no ongoing connection)...");
		
		// Initialize audio analyzer for playback/FFT (local Web Audio API, not server)
		if (audioAnalyzer) {
			audioAnalyzer.destroy();
		}
		audioAnalyzer = new AudioAnalyzer();
		const success = await audioAnalyzer.initializeAudio(file);
		
		// Initialize Essentia API and run offline analysis (separate from AudioAnalyzer)
		try {
			if (!essentiaService) {
				console.log("[VideoWorkbench] Creating EssentiaService instance...");
				essentiaService = new EssentiaService();
				await essentiaService.initialize();
			}
			
			if (!essentiaService.isReady) {
				console.warn("[VideoWorkbench] ⚠️ EssentiaService is not ready, attempting to reinitialize...");
				await essentiaService.initialize();
			}
			
			console.log("[VideoWorkbench] Starting Essentia analysis via API...");
			const result = await essentiaService.analyzeFile(file);
			console.log("[VideoWorkbench] Analysis complete:", result);
			console.log("[VideoWorkbench] 📡 API connection closed (one-time request completed)");
			
			if (result && (result.bpm > 0 || result.beats?.length > 0)) {
				analysisData = result;
				console.log("[VideoWorkbench] ✅ Analysis data set:", {
					bpm: result.bpm,
					beatsCount: result.beats?.length || 0,
					onsetsCount: result.onsets?.length || 0,
					confidence: result.confidence,
					duration: result.duration
				});
				console.log("[VideoWorkbench] ℹ️ Note: 'Playing audio, analyzer state' messages are from LOCAL Web Audio API (not server)");
			} else {
				console.warn("[VideoWorkbench] ⚠️ Analysis returned empty data, API may not have processed the file");
			}
		} catch (err) {
			console.error("[VideoWorkbench] ❌ Essentia analysis failed:", err);
			console.error("[VideoWorkbench] Error details:", err.stack);
		} finally {
			isAnalyzingAudio = false;
		}
		
	if (success) {
			audioAnalyzer.setVolume(audioVolume);
			// Set initial duration (may update once metadata loads)
			audioAnalyzer.audioElement?.addEventListener('loadedmetadata', () => {
				audioDuration = audioAnalyzer.getDuration();
			});
			// Start audio analysis loop
			startAudioAnalysis();
		}
	}

	function startAudioAnalysis() {
		if (!audioAnalyzer) return;
		
		function updateAudioUniforms() {
			if (audioAnalyzer && audioAnalyzer.isAnalyzing) {
				const audioData = audioAnalyzer.getAudioData();
				
				// Update playhead time for waveform
				audioCurrentTime = audioAnalyzer.getCurrentTime?.() || 0;
				if (!audioDuration && audioAnalyzer.getDuration?.()) {
					audioDuration = audioAnalyzer.getDuration();
				}
				
				uniforms.u_audioLevel.value = audioData.audioLevel;
				uniforms.u_bassLevel.value = audioData.bassLevel;
				uniforms.u_midLevel.value = audioData.midLevel;
				uniforms.u_trebleLevel.value = audioData.trebleLevel;
				
				// Apply audio-reactive filter intensity only if audio is actually playing
				if (audioReactivePlayback) {
					const baseIntensity = filtersEnabled ? 1.0 : 0.0;
					const audioModulation = audioData.audioLevel * audioFilterIntensity;
					uniforms.u_intensity.value = Math.min(baseIntensity + audioModulation, 2.0);
				}
			} else {
				// Reset audio levels when no audio is playing
				uniforms.u_audioLevel.value = 0;
				uniforms.u_bassLevel.value = 0;
				uniforms.u_midLevel.value = 0;
				uniforms.u_trebleLevel.value = 0;
			}
			
			requestAnimationFrame(updateAudioUniforms);
		}
		
		updateAudioUniforms();
	}

	function handleAudioVolumeChange() {
		if (audioAnalyzer) {
			audioAnalyzer.setVolume(audioVolume);
		}
	}

	function playAudio() {
		if (audioAnalyzer) {
			console.log('Playing audio, analyzer state:', audioAnalyzer.isAnalyzing);
			audioAnalyzer.play();
			console.log('Audio playing, analyzer state:', audioAnalyzer.isAnalyzing);
		}
	}

	function pauseAudio() {
		if (audioAnalyzer) {
			audioAnalyzer.pause();
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
</script>

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

<div class="app-container">
	<aside class="sidebar">
		<h2>Video Shaders</h2>
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

				<!-- All UI components are now direct children of the Pane -->
				<Button title="Upload Video" on:click={handleUploadClick} />

				<Tweakpane.Separator />

				{#if $activeVideo}
					<div class="playback-controls">
						<Button title="Play" on:click={() => shaderPlayerRef?.play()} />
						<Button title="Pause" on:click={() => shaderPlayerRef?.pause()} />
					</div>
					<Tweakpane.Separator />
				{/if}

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
						<!-- Removed slider since cycling is now sequential -->
					{/if}
				</Tweakpane.Folder>

				<!-- Audio Controls -->
				<Tweakpane.Folder title="Audio Controls" expanded={selectedShaderName === 'XlsczN'}>
					<Button title="Upload Audio" on:click={handleAudioUploadClick} />
					
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
						
						<Tweakpane.Checkbox
							bind:value={audioReactivePlayback}
							label="Audio Reactive Playback"
						/>
						
						<Tweakpane.Slider
							bind:value={beatSensitivity}
							label="Beat Sensitivity"
							min={0.1}
							max={1.0}
							step={0.01}
						/>
						
						<Tweakpane.Slider
							bind:value={audioFilterIntensity}
							label="Audio Filter Intensity"
							min={0}
							max={2.0}
							step={0.01}
						/>
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
							max={5}
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
				{uniforms}
				{filtersEnabled}
				{audioReactivePlayback}
				{analysisData}
			/>
			{:else}
				<div class="placeholder">
					<h3>Upload videos to begin</h3>
					<p>All videos will be pre-decoded for seamless playback</p>
				</div>
			{/if}
		</div>

		{#if audioFile}
			<div class="waveform-wrapper">
				<WaveformDisplay
					{audioFile}
					beats={analysisData.beats || []}
					onsets={analysisData.onsets || []}
					bpm={analysisData.bpm || 0}
					currentTime={audioCurrentTime}
					duration={audioDuration}
					onSeek={(time) => audioAnalyzer?.seekTo?.(time)}
				/>
			</div>
		{/if}
	</main>
</div>

<style>
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
