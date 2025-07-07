<script>
	import ShaderPlayer from '$lib/ShaderPlayer.svelte';
	import { Pane, TabGroup, TabPage, Button, Textarea } from 'svelte-tweakpane-ui';

	let fragmentShader = $state('');
	let customShaderSrc = $state('');
	let videoSrc = $state(
		'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
	);
	let uploadInput;

	const shaders = {
		Passthrough: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      void main() {
        gl_FragColor = texture2D(u_texture, vUv);
      }
    `,
		Grayscale: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      void main() {
        vec4 color = texture2D(u_texture, vUv);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(vec3(gray), 1.0);
      }
    `,
		Sepia: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      void main() {
        vec4 color = texture2D(u_texture, vUv);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        gl_FragColor = vec4(gray * vec3(1.2, 1.0, 0.8), 1.0);
      }
    `,
		Invert: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      void main() {
        vec4 color = texture2D(u_texture, vUv);
        gl_FragColor = vec4(1.0 - color.rgb, 1.0);
      }
    `
	};

	let customShaderSrc = $state(shaders['Passthrough']);

	function selectShader(name) {
		fragmentShader = shaders[name];
		customShaderSrc = shaders[name];
	}

	function applyCustomShader() {
		fragmentShader = customShaderSrc;
	}

	function handleFileUpload(event) {
		const file = event.target.files[0];
		if (file) {
			if (videoSrc) {
				URL.revokeObjectURL(videoSrc);
			}
			videoSrc = URL.createObjectURL(file);
		}
	}
</script>

<div class="app-container">
	<div class="player-container">
		{#if videoSrc}
			<ShaderPlayer src={videoSrc} {fragmentShader} />
		{/if}
	</div>
	<div class="controls-container">
		<Pane title="Controls" position="relative">
			<div class="upload-section">
				<button class="upload-button" onclick={() => uploadInput.click()}> Upload Video </button>
				<input
					bind:this={uploadInput}
					type="file"
					onchange={handleFileUpload}
					accept="video/*"
					hidden
				/>
			</div>
			<TabGroup>
				<TabPage title="Presets">
					{#each Object.keys(shaders) as name}
						<Button title={name} onclick={() => selectShader(name)} />
					{/each}
				</TabPage>
				<TabPage title="Custom">
					<Textarea bind:value={customShaderSrc} title="GLSL Code" rows={15} />
					<Button title="Apply Custom Shader" onclick={applyCustomShader} />
				</TabPage>
			</TabGroup>
		</Pane>
	</div>
</div>

<style>
	.app-container {
		display: flex;
		height: 100vh;
		padding: 1rem;
		gap: 1rem;
		box-sizing: border-box;
	}
	.player-container {
		flex-grow: 1;
		border: 1px solid #444;
		border-radius: 4px;
	}
	.controls-container {
		width: 350px;
		flex-shrink: 0;
		background: #2a2a2a;
		padding: 1rem;
		border-radius: 4px;
		overflow-y: auto;
	}
	.upload-section {
		margin-bottom: 1rem;
	}
	.upload-button {
		width: 100%;
		padding: 0.75rem;
		background-color: #4a4a4a;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		text-align: center;
	}
	.upload-button:hover {
		background-color: #5a5a5a;
	}
	:global(.tp-dfwv) {
		width: 100% !important;
	}
</style>
