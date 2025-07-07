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
	let videoQueue = $state([]);
	let currentVideoIndex = $state(0);
	let uploadInput;
	let uniforms = $state({
		u_strength: { value: 1.0 },
		u_vignette_color: { value: { r: 0, g: 0, b: 0 } },
		u_vignette_center: { value: { x: 0.5, y: 0.5 } }
	});
	let player;

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

	async function handleFileUpload(event) {
		const files = Array.from(event.target.files);
		const newVideos = [];
		for (const file of files) {
			const src = URL.createObjectURL(file);
			const thumb = await createThumbnail(src);
			newVideos.push({ src, thumb, name: file.name });
		}
		videoQueue = newVideos;
		currentVideoIndex = 0;
	}

	function createThumbnail(src) {
		return new Promise((resolve) => {
			const video = document.createElement('video');
			video.src = src;
			video.muted = true;
			video.onloadeddata = () => {
				const canvas = document.createElement('canvas');
				canvas.width = 160;
				canvas.height = 90;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(video, 0, 0, 160, 90);
				resolve(canvas.toDataURL());
				URL.revokeObjectURL(video.src);
			};
		});
	}

	function playNextVideo() {
		currentVideoIndex = (currentVideoIndex + 1) % videoQueue.length;
	}
</script>

<div class="app-container">
	<div class="main-content">
		<div class="player-section">
			{#if videoQueue.length > 0}
				<ShaderPlayer
					src={videoQueue[currentVideoIndex].src}
					{fragmentShader}
					{uniforms}
					bind:this={player}
					on:ended={playNextVideo}
				/>
			{/if}
		</div>
		<div class="thumbnail-bar">
			{#each videoQueue as video, i}
				<div class="thumbnail" class:active={i === currentVideoIndex}>
					<img src={video.thumb} alt={video.name} />
					<span>{video.name}</span>
				</div>
			{/each}
		</div>
	</div>
	<aside class="controls-section">
		<Pane title="Controls" position="fixed">
			<Button title="Upload Videos" on:click={() => uploadInput.click()} />
			<input
				bind:this={uploadInput}
				type="file"
				onchange={handleFileUpload}
				accept="video/*"
				multiple
				hidden
			/>
			<div class="playback-controls">
				<Button title="Play" on:click={() => player?.play()} />
				<Button title="Pause" on:click={() => player?.pause()} />
				<Button title="Reset" on:click={() => player?.reset()} />
			</div>
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
	.main-content {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}
	.player-section {
		flex-grow: 1;
	}
	.thumbnail-bar {
		flex-shrink: 0;
		display: flex;
		gap: 1rem;
		padding: 1rem;
		background: #222;
		overflow-x: auto;
	}
	.thumbnail {
		border: 2px solid transparent;
		border-radius: 4px;
		cursor: pointer;
	}
	.thumbnail.active {
		border-color: #00aaff;
	}
	.thumbnail img {
		width: 160px;
		height: 90px;
		object-fit: cover;
		display: block;
	}
	.thumbnail span {
		display: block;
		font-size: 0.8rem;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.controls-section {
		width: 350px;
		flex-shrink: 0;
	}
	.playback-controls {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
</style>
