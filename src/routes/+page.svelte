<script>
	import * as Tweakpane from 'svelte-tweakpane-ui';
	import ShaderPlayer from '$lib/ShaderPlayer.svelte';
	import VideoControls from '$lib/VideoControls.svelte';
	import { activeVideo } from '$lib/stores.js';

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

	let selectedShaderName = $state('Grayscale');
	let uniforms = $state({
		u_strength: { value: 1.0 },
		u_vignette_strength: { value: 0.4 },
		u_vignette_falloff: { value: 0.2 }
	});

	let fragmentShader = $derived(shaders[selectedShaderName]);
	let shaderPlayerRef = $state(); // Reference to ShaderPlayer for playback controls
</script>

<div class="app-container">
	<aside class="sidebar">
		<h2>Video Shaders</h2>
		<div class="unified-controls">
			<Tweakpane.Pane title="Video Shaders Controls">
				<VideoControls {shaderPlayerRef} />
				
				<Tweakpane.Separator />
				
				<Tweakpane.List
					bind:value={selectedShaderName}
					label="Shader"
					options={{
						Grayscale: 'Grayscale',
						Vignette: 'Vignette'
					}}
				/>

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
		width: 100%;
		height: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
		border: 2px dashed #444;
		border-radius: 8px;
		color: #888;
	}
</style>
