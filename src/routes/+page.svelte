<script>
	import { onMount } from 'svelte';
	import * as Tweakpane from 'svelte-tweakpane-ui';
	import Button from 'svelte-tweakpane-ui/Button.svelte';
	import ShaderPlayer from '$lib/ShaderPlayer.svelte';
	import { videoAssets, activeVideo } from '$lib/stores.js';
	import { generateThumbnail } from '$lib/video-utils.js';
	import { vhsFragmentShader, vhsUniforms } from '$lib/shaders/vhs-shader.js';

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
		u_vignette_falloff: { value: 0.3 }
	});
	$: fragmentShader = selectedShaderName === 'VHS' ? vhsFragmentShader : 
		selectedShaderName === 'Grayscale' ? shaders.Grayscale : shaders.Vignette;

	// --- Component Refs ---
	let shaderPlayerRef = $state();
	let fileInput;

	// --- File Handling Logic ---
	function handleUploadClick() {
		fileInput?.click();
	}

	async function onFileSelected(event) {
		const file = event.currentTarget.files?.[0];
		if (!file) return;

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

	function handleVideoSelect(asset) {
		activeVideo.set(asset);
	}

	// Add VHS preset functions
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

<!-- Hidden file input for the entire page -->
<input
	type="file"
	bind:this={fileInput}
	onchange={onFileSelected}
	accept="video/mp4,video/webm"
	hidden
/>

<div class="app-container">
	<aside class="sidebar">
		<h2>Video Shaders</h2>
		<div class="unified-controls">
			<Tweakpane.Pane title="Video Shaders Controls">
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
						Grayscale: 'Grayscale',
						Vignette: 'Vignette'
					}}
				/>

				{#if selectedShaderName === 'VHS'}
					<Tweakpane.Folder title="VHS Effects" expanded={true}>
						<Tweakpane.Input 
							bind:value={uniforms.u_distortion.value} 
							label="Barrel Distortion" 
							min={0} 
							max={0.5} 
							step={0.01}
						/>
						
						<Tweakpane.Input 
							bind:value={uniforms.u_scanlineIntensity.value} 
							label="Scanline Intensity" 
							min={0} 
							max={1} 
							step={0.01}
						/>
						
						<Tweakpane.Input 
							bind:value={uniforms.u_rgbShift.value} 
							label="RGB Shift" 
							min={0} 
							max={0.1} 
							step={0.001}
						/>
						
						<Tweakpane.Input 
							bind:value={uniforms.u_noise.value} 
							label="Noise" 
							min={0} 
							max={0.5} 
							step={0.01}
						/>
						
						<Tweakpane.Input 
							bind:value={uniforms.u_flickerIntensity.value} 
							label="Flicker Intensity" 
							min={0} 
							max={2.0} 
							step={0.01}
						/>
					</Tweakpane.Folder>
					
					<Tweakpane.Folder title="VHS Tracking" expanded={true}>
						<Tweakpane.Input 
							bind:value={uniforms.u_trackingIntensity.value} 
							label="Tracking Intensity" 
							min={0} 
							max={1} 
							step={0.01}
						/>
						
						<Tweakpane.Input 
							bind:value={uniforms.u_trackingSpeed.value} 
							label="Tracking Speed" 
							min={0} 
							max={5.0} 
							step={0.1}
						/>
						
						<Tweakpane.Input 
							bind:value={uniforms.u_trackingFreq.value} 
							label="Tracking Frequency" 
							min={1} 
							max={100} 
							step={1}
						/>
					</Tweakpane.Folder>
					
					<Tweakpane.Folder title="VHS Tape Effects" expanded={true}>
						<Tweakpane.Input 
							bind:value={uniforms.u_waveAmplitude.value} 
							label="Wave Amplitude" 
							min={0} 
							max={1} 
							step={0.01}
						/>
					</Tweakpane.Folder>
					
					<Tweakpane.Separator />
					
					<Tweakpane.Folder title="VHS Presets" expanded={false}>
						<Button title="Classic VHS" on:click={() => applyVHSPreset('classic')} />
						<Button title="Damaged Tape" on:click={() => applyVHSPreset('damaged')} />
						<Button title="Clean VHS" on:click={() => applyVHSPreset('clean')} />
						<Button title="Heavy Distortion" on:click={() => applyVHSPreset('heavy')} />
					</Tweakpane.Folder>
				{/if}

				{#if selectedShaderName === 'Grayscale'}
					<Tweakpane.Input bind:value={uniforms.u_strength.value} label="Strength" min={0} max={1} />
				{/if}

				{#if selectedShaderName === 'Vignette'}
					<Tweakpane.Input
						bind:value={uniforms.u_vignette_strength.value}
						label="Vignette Strength"
						min={0}
						max={1}
					/>
					<Tweakpane.Input
						bind:value={uniforms.u_vignette_falloff.value}
						label="Vignette Falloff"
						min={0}
						max={1}
					/>
				{/if}
			</Tweakpane.Pane>
		</div>
	</aside>

	<main class="main-content">
		{#if $activeVideo}
			<ShaderPlayer
				bind:this={shaderPlayerRef}
				file={$activeVideo.file}
				{fragmentShader}
				{uniforms}
				key={$activeVideo.id}
			/>
		{:else}
			<div class="placeholder">
				<h3>Upload a video to begin</h3>
			</div>
		{/if}
	</main>
</div>

<style>
	.app-container {
		display: flex;
		height: 100vh;
		background-color: #1a1a1a;
		color: #fff;
	}
	.sidebar {
		width: 350px;
		padding: 1rem;
		background-color: #242424;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		overflow-y: auto;
	}
	.sidebar h2 {
		text-align: center;
		margin-bottom: 0;
	}
    .unified-controls {
        flex: 1;
    }
	.main-content {
		flex-grow: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 1rem;
	}
	.placeholder {
		text-align: center;
	}
	.playback-controls {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.thumbnail-gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 10px;
		margin-bottom: 1rem;
	}
	.thumbnail-button {
		background-color: #333;
		border: 2px solid #444;
		border-radius: 4px;
		padding: 0;
		cursor: pointer;
		transition: all 0.2s ease;
        font-family: inherit;
        color: inherit;
		width: 100%;
		aspect-ratio: 16 / 9;
		background-size: cover;
		background-position: center;
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: center;
	}
	.thumbnail-button:hover {
		border-color: #666;
	}
	.thumbnail-button.active {
		border-color: #00aaff;
	}
	.thumbnail-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #444;
		color: #888;
		position: absolute;
		top: 0;
		left: 0;
	}
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
</style>









