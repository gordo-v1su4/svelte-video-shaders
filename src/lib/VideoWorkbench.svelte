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

		// Existing shader uniforms
		u_strength: { value: 0.5 },
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
		u_resolution: { value: [1920, 1080] }
	});
	const fragmentShader = $derived(
		selectedShaderName === 'VHS' ? vhsFragmentShader :
		selectedShaderName === 'XlsczN' ? xlsczNFragmentShader :
		selectedShaderName === 'Grayscale' ? shaders.Grayscale : shaders.Vignette
	);

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
		
		// Initialize audio analyzer for playback/FFT
		if (audioAnalyzer) {
			audioAnalyzer.destroy();
		}
		audioAnalyzer = new AudioAnalyzer();
		const success = await audioAnalyzer.initializeAudio(file);
		
	// Initialize Essentia API and run offline analysis
		try {
			if (!essentiaService) {
				essentiaService = new EssentiaService();
				await essentiaService.initialize();
			}
			
			console.log("Starting Essentia analysis via API...");
			const result = await essentiaService.analyzeFile(file);
			console.log("Analysis complete:", result);
			
			analysisData = result;
		} catch (err) {
			console.error("Essentia analysis failed:", err);
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
						Grayscale: 'Grayscale',
						Vignette: 'Vignette'
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

				{#if selectedShaderName === 'Vignette'}
					<Tweakpane.Slider
						bind:value={uniforms.u_vignette_strength.value}
						label="Vignette Strength"
						min={0}
						max={1}
						step={0.01}
					/>
					<Tweakpane.Slider
						bind:value={uniforms.u_vignette_falloff.value}
						label="Vignette Falloff"
						min={0}
						max={1}
						step={0.01}
					/>
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
			<WaveformDisplay
				{audioFile}
				beats={analysisData.beats}
				bpm={analysisData.bpm}
				currentTime={audioCurrentTime}
				duration={audioDuration}
				onSeek={(time) => audioAnalyzer?.seekTo?.(time)}
			/>
		{/if}
	</main>
</div>

<style>
	.app-container { display: flex; height: 100vh; background-color: #1a1a1a; color: #fff; }
	.sidebar { width: 350px; padding: 1rem; background-color: #242424; display: flex; flex-direction: column; gap: 1.5rem; overflow-y: auto; }
	.sidebar h2 { text-align: center; margin-bottom: 0; }
	.unified-controls { flex: 1; }
	.main-content { flex-grow: 1; display: flex; justify-content: center; align-items: center; padding: 1rem; }
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
