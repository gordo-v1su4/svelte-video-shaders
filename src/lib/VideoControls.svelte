<script>
    import Button from 'svelte-tweakpane-ui/Button.svelte';
	import { videoAssets, activeVideo } from './stores.js';
	import { generateThumbnail } from './video-utils.js';

	let { shaderPlayerRef } = $props();
	let fileInput;

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
        if ($videoAssets.length === 1) {
            activeVideo.set(newAsset);
        }

		const thumbUrl = await generateThumbnail(file);
		videoAssets.update((assets) =>
			assets.map((asset) => (asset.id === newAsset.id ? { ...asset, thumbnailUrl: thumbUrl } : asset))
		);
	}

	function handleVideoSelect(asset) {
		activeVideo.set(asset);
	}
</script>

<!-- This component now creates its own Tweakpane UI elements declaratively -->
<div class="controls-wrapper">
	<!-- Hidden file input -->
	<input
		type="file"
		bind:this={fileInput}
		onchange={onFileSelected}
		accept="video/mp4,video/webm"
		hidden
	/>

	<Button title="Upload Video" on:click={handleUploadClick} />

	<div class="playback-controls">
		<Button title="Play" on:click={() => shaderPlayerRef?.play()} />
		<Button title="Pause" on:click={() => shaderPlayerRef?.pause()} />
	</div>

	<div class="thumbnail-gallery">
		{#each $videoAssets as asset (asset.id)}
			<button
				class="thumbnail-button"
				class:active={asset.id === $activeVideo?.id}
				onclick={() => handleVideoSelect(asset)}
			>
				{#if asset.thumbnailUrl}
					<img src={asset.thumbnailUrl} alt="Thumbnail for {asset.name}" />
				{:else}
					<div class="thumbnail-placeholder">Loading...</div>
				{/if}
				<span class="thumbnail-label">{asset.name}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.controls-wrapper {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.playback-controls {
		display: flex;
		gap: 0.5rem;
	}
	.thumbnail-gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 10px;
	}
	.thumbnail-button {
		background: #333;
		border: 2px solid #444;
		border-radius: 4px;
		padding: 5px;
		cursor: pointer;
		transition: all 0.2s ease;
        font-family: inherit;
        color: inherit;
		width: 100%;
	}
	.thumbnail-button:hover {
		border-color: #666;
	}
	.thumbnail-button.active {
		border-color: #00aaff;
	}
	.thumbnail-button img {
		width: 100%;
		height: 70px;
		object-fit: cover;
		border-radius: 2px;
	}
	.thumbnail-placeholder {
		width: 100%;
		height: 70px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #444;
		color: #888;
	}
	.thumbnail-label {
		font-size: 0.8rem;
		color: #eee;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 100%;
		text-align: center;
		margin-top: 5px;
	}
</style>
