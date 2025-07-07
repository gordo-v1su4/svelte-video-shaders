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
	let uniforms = $state({
		u_strength: { value: 1.0 },
		u_vignette_color: { value: { r: 0, g: 0, b: 0 } },
		u_vignette_center: { value: { x: 0.5, y: 0.5 } }
	});
	let player; // This will be bound to the ShaderPlayer component instance

	const shaders = {
		Passthrough: `
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      void main() {
        gl_FragColor = texture2D(u_texture, v_uv);
      }
    `,
		'RGB Shift': `
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      void main() {
        float shift = 0.01;
        vec4 red = texture2D(u_texture, v_uv + vec2(shift, 0.0));
        vec4 green = texture2D(u_texture, v_uv);
        vec4 blue = texture2D(u_texture, v_uv - vec2(shift, 0.0));
        gl_FragColor = vec4(red.r, green.g, blue.b, 1.0);
      }
    `,
		Grayscale: `
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      uniform float u_strength;
      void main() {
        vec4 color = texture2D(u_texture, v_uv);
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        vec3 grayscale = vec3(gray);
        gl_FragColor = vec4(mix(color.rgb, grayscale, u_strength), 1.0);
      }
    `,
		Noise: `
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      uniform float u_strength;

      float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
      }

      void main() {
        vec4 color = texture2D(u_texture, v_uv);
        float noise = (random(v_uv) - 0.5) * u_strength;
        gl_FragColor = vec4(color.rgb + noise, 1.0);
      }
    `,
		Vignette: `
      varying vec2 v_uv;
      uniform sampler2D u_texture;
      uniform float u_strength;
      uniform vec3 u_vignette_color;
      uniform vec2 u_vignette_center;

      void main() {
        vec4 color = texture2D(u_texture, v_uv);
        float dist = distance(v_uv, u_vignette_center);
        float vignette = smoothstep(0.8, u_strength * 0.2, dist);
        gl_FragColor = vec4(mix(color.rgb, u_vignette_color, 1.0 - vignette), 1.0);
      }
    `
	};

	// Initialize with a default shader
	fragmentShader = shaders['Passthrough'];
	customShaderSrc = shaders['Passthrough'];

	function selectShader(name) {
		fragmentShader = shaders[name];
		customShaderSrc = shaders[name];
	}

	function applyCustomShader() {
		fragmentShader = customShaderSrc;
	}

	function triggerFileUpload() {
		console.log('[DEBUG] triggerFileUpload: Function called.');
		try {
			const input = document.createElement('input');
			input.type = 'file';
			input.accept = 'video/*';
			input.multiple = true;
			input.style.display = 'none';
			input.onchange = handleFileUpload;
			document.body.appendChild(input);
			console.log('[DEBUG] triggerFileUpload: Input element created and appended to body.');
			input.click();
			console.log('[DEBUG] triggerFileUpload: input.click() called.');
			document.body.removeChild(input);
			console.log('[DEBUG] triggerFileUpload: Input element removed from body.');
		} catch (e) {
			console.error('[DEBUG] triggerFileUpload: An error occurred.', e);
		}
	}

	async function handleFileUpload(event) {
		console.log('[DEBUG] handleFileUpload: Function called.', event);
		const files = Array.from(event.target.files);
		if (files.length === 0) {
			console.log('[DEBUG] handleFileUpload: No files selected.');
			return;
		}
		console.log(`[DEBUG] handleFileUpload: ${files.length} file(s) selected.`);

		const newVideos = [];
		for (const file of files) {
			// Keep the raw file object
			const thumb = await createThumbnail(file);
			newVideos.push({ file, thumb, name: file.name });
		}
		videoQueue = newVideos;
		currentVideoIndex = 0;
		console.log('[DEBUG] handleFileUpload: Video queue updated.', $state.snapshot(videoQueue));
	}

	function createThumbnail(file) {
		return new Promise((resolve) => {
			const video = document.createElement('video');
			const src = URL.createObjectURL(file); // Create blob URL just for thumbnail
			video.src = src;
			video.muted = true;
			video.onloadeddata = () => {
				video.currentTime = 1; // Seek to 1 second for a better thumbnail
			};
			video.onseeked = () => {
				const canvas = document.createElement('canvas');
				canvas.width = 160;
				canvas.height = 90;
				const ctx = canvas.getContext('2d');
				ctx.drawImage(video, 0, 0, 160, 90);
				resolve(canvas.toDataURL());
				URL.revokeObjectURL(src); // Clean up blob URL immediately after use
			};
		});
	}

	function selectVideo(index) {
		currentVideoIndex = index;
	}
</script>

<div class="app-container">
	<div class="main-content">
		<div class="upload-bar">
			<button class="upload-button" onclick={triggerFileUpload}>Upload Videos</button>
		</div>
		<div class="player-section">
			{#if videoQueue.length > 0}
				<ShaderPlayer
					bind:this={player}
					file={videoQueue[currentVideoIndex].file}
					{fragmentShader}
					{uniforms}
				/>
			{:else}
				<div class="placeholder">
					<h2>Upload a video to get started</h2>
				</div>
			{/if}
		</div>
		<div class="thumbnail-bar">
			{#each videoQueue as video, i}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div class="thumbnail" class:active={i === currentVideoIndex} onclick={() => selectVideo(i)}>
					<img src={video.thumb} alt={video.name} />
					<span>{video.name}</span>
				</div>
			{/each}
		</div>
	</div>
	<aside class="controls-section">
		<Pane title="Controls" position="fixed">
			<div class="playback-controls">
				<Button title="Play" onclick={() => player?.play()} />
				<Button title="Pause" onclick={() => player?.pause()} />
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
						<Button title={name} onclick={() => selectShader(name)} />
					{/each}
				</TabPage>
				<TabPage title="Custom">
					<Textarea bind:value={customShaderSrc} title="GLSL Code" rows={15} />
					<Button title="Apply Custom Shader" onclick={applyCustomShader} />
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
		color: #eee;
	}
	.main-content {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
	}
	.upload-bar {
		padding: 0.5rem 1rem;
		background-color: #2a2a2a;
		flex-shrink: 0;
	}
	.upload-button {
		background-color: #007acc;
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
	}
	.upload-button:hover {
		background-color: #008cdd;
	}
	.player-section {
		flex-grow: 1;
		display: flex;
		justify-content: center;
		align-items: center;
		background-color: #000;
	}
	.placeholder {
		text-align: center;
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
		text-align: center;
	}
	.thumbnail.active {
		border-color: #00aaff;
	}
	.thumbnail img {
		width: 160px;
		height: 90px;
		object-fit: cover;
		display: block;
		border-radius: 2px;
	}
	.thumbnail span {
		display: block;
		font-size: 0.8rem;
		margin-top: 0.5rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 160px;
	}
	.controls-section {
		width: 350px;
		flex-shrink: 0;
	}
	.playback-controls {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
		margin: 1rem 0;
	}
</style>
