<script>
    import Button from 'svelte-tweakpane-ui/Button.svelte';
	import { videoAssets, activeVideo } from './stores.js';
	import { generateThumbnail } from './video-utils.js';

	let { shaderPlayerRef } = $props(); // Reference to ShaderPlayer component
	let fileInput; // bind:this for the hidden file input

	// Playback control functions
	function handlePlay() {
		console.log('🎬 Play button clicked');
		if (shaderPlayerRef?.play) {
			shaderPlayerRef.play();
		}
	}

	function handlePause() {
		console.log('⏸️ Pause button clicked');
		if (shaderPlayerRef?.pause) {
			shaderPlayerRef.pause();
		}
	}

	function handleFrameForward() {
		console.log('⏭️ Frame forward button clicked');
		if (shaderPlayerRef?.frameForward) {
			shaderPlayerRef.frameForward();
		}
	}

	function handleFrameBackward() {
		console.log('⏮️ Frame backward button clicked');
		if (shaderPlayerRef?.frameBackward) {
			shaderPlayerRef.frameBackward();
		}
	}

	function handleUploadClick() {
		console.log('🔍 TWEAKPANE UPLOAD BUTTON CLICKED');
		console.log('🔍 File input element:', fileInput);
		if (fileInput) {
			console.log('🔍 Attempting to trigger file input click...');
			fileInput.click();
			console.log('🔍 File input click triggered');
		} else {
			console.error('🔍 File input not available');
		}
	}

	async function onFileSelected(event) {
		console.log('🔍 FILE SELECTED EVENT TRIGGERED');
		const files = event.currentTarget.files;
		console.log('🔍 Files:', files);
		if (!files || files.length === 0) {
			console.log('🔍 No files selected');
			return;
		}
		const file = files[0];
		console.log('🔍 Selected file:', file.name);

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

<div class="video-controls-container">
    <!-- Hidden file input -->
    <input
        type="file"
        bind:this={fileInput}
        onchange={onFileSelected}
        accept="video/mp4,video/webm"
        hidden
    />

	<div class="video-library-section">
		<h3>Video Library</h3>
        <Button title="Upload Video" on:click={handleUploadClick} />
	</div>

	{#if $activeVideo}
	<div class="playback-controls-section">
		<h3>Playback Controls</h3>
		<div class="playback-buttons">
			<Button title="Frame Back" on:click={handleFrameBackward} />
			<Button title="Pause" on:click={handlePause} />
			<Button title="Play" on:click={handlePlay} />
			<Button title="Frame Forward" on:click={handleFrameForward} />
		</div>
	</div>
	{/if}

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
				<span>{asset.name}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.video-controls-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
        padding: 1rem;
        background-color: #222;
        border-radius: 8px;
	}

    .video-library-section {
        margin-bottom: 1rem;
    }
    
    .video-library-section h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #ccc;
    }

    .playback-controls-section {
        margin-bottom: 1rem;
    }
    
    .playback-controls-section h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #ccc;
    }

    .playback-buttons {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

	.thumbnail-gallery {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.thumbnail-button {
		background: #333;
		border: 2px solid #444;
		border-radius: 4px;
		padding: 5px;
		cursor: pointer;
		transition: all 0.2s ease;
        max-width: 150px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        font-family: inherit;
        color: inherit;
	}

	.thumbnail-button:hover {
		border-color: #666;
	}

	.thumbnail-button.active {
		border-color: #00aaff;
		box-shadow: 0 0 10px #00aaff;
	}

	.thumbnail-button img {
		width: 120px;
		height: 70px;
		object-fit: cover;
		border-radius: 2px;
	}

    .thumbnail-button span {
        font-size: 0.8rem;
        color: #eee;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
        text-align: center;
    }

	.thumbnail-placeholder {
		width: 120px;
		height: 70px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #444;
		color: #888;
		font-size: 0.9rem;
		border-radius: 2px;
	}
</style>
