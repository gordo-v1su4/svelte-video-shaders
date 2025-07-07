<script>
	import ShaderPlayer from '$lib/ShaderPlayer.svelte';
	import {
		Pane,
		TabGroup,
		TabPage,
		Button,
		Textarea,
		Slider,
		Color,
		Point
	} from 'svelte-tweakpane-ui';

	let fragmentShader = $state('');
	let customShaderSrc = $state('');
	let videoSrc = $state(
		'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
	);
	let uploadInput;
	let uniforms = $state({
		u_strength: { value: 1.0 },
		u_vignette_color: { value: { r: 0, g: 0, b: 0 } },
		u_vignette_center: { value: { x: 0.5, y: 0.5 } }
	});

	const shaders = {
		Passthrough: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      uniform float u_time;
      void main() {
        gl_FragColor = texture2D(u_texture, vUv);
      }
    `,
		'RGB Shift': `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      uniform float u_time;
      void main() {
        float shift = sin(u_time * 2.0) * 0.01;
        vec4 red = texture2D(u_texture, vUv + vec2(shift, 0.0));
        vec4 green = texture2D(u_texture, vUv);
        vec4 blue = texture2D(u_texture, vUv - vec2(shift, 0.0));
        gl_FragColor = vec4(red.r, green.g, blue.b, 1.0);
      }
    `,
		Grayscale: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      uniform float u_strength;
      void main() {
        vec4 color = texture2D(u_texture, vUv);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec3 grayscale = vec3(gray);
        gl_FragColor = vec4(mix(color.rgb, grayscale, u_strength), 1.0);
      }
    `,
		Noise: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      uniform float u_time;
      uniform float u_strength;

      // 2D Random function
      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        vec4 color = texture2D(u_texture, vUv);
        float noise = (random(vUv * u_time) - 0.5) * u_strength;
        gl_FragColor = vec4(color.rgb + noise, 1.0);
      }
    `,
		Vignette: `
      varying vec2 vUv;
      uniform sampler2D u_texture;
      uniform float u_strength;
      uniform vec3 u_vignette_color;
      uniform vec2 u_vignette_center;

      void main() {
        vec4 color = texture2D(u_texture, vUv);
        float dist = distance(vUv, u_vignette_center);
        float vignette = smoothstep(0.8, u_strength * 0.2, dist);
        gl_FragColor = vec4(mix(color.rgb, u_vignette_color, 1.0 - vignette), 1.0);
      }
    `
	};

	fragmentShader = shaders['Passthrough'];
	customShaderSrc = shaders['Passthrough'];

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
	<div class="player-section">
		{#if videoSrc}
			<ShaderPlayer src={videoSrc} {fragmentShader} {uniforms} />
		{/if}
	</div>
	<aside class="controls-section">
		<Pane title="Controls" position="fixed">
			<Button title="Upload Video" on:click={() => uploadInput.click()} />
			<input
				bind:this={uploadInput}
				type="file"
				onchange={handleFileUpload}
				accept="video/*"
				hidden
			/>
			<Slider
				bind:value={uniforms.u_strength.value}
				label="Strength"
				min={0}
				max={1}
				step={0.01}
			/>
			<Color bind:value={uniforms.u_vignette_color.value} label="Vignette Color" />
			<Point
				bind:value={uniforms.u_vignette_center.value}
				label="Vignette Center"
				x={{ min: -1, max: 1 }}
				y={{ min: -1, max: 1 }}
			/>
			<TabGroup>
				<TabPage title="Presets">
					{#each Object.keys(shaders) as name}
						<Button title={name} on:click={() => selectShader(name)} />
					{/each}
				</TabPage>
				<TabPage title="Custom">
					<Textarea bind:value={customShaderSrc} title="GLSL Code" rows={15} />
					<Button title="Apply Custom Shader" on:click={applyCustomShader} />
				</TabPage>
			</TabGroup>
		</Pane>
	</aside>
</div>

<style>
	.app-container {
		display: flex;
		height: 100vh;
		background-color: #1a1a1a;
	}
	.player-section {
		flex-grow: 1;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.controls-section {
		width: 350px;
		flex-shrink: 0;
	}
</style>
