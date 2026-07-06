<script>
	import { Button } from 'svelte-ux';

	let {
		onStart = (
			/** @type {{ mode: 'autopilot' | 'studio', songs: File[], videos: File[], stems: File[] }} */ _payload
		) => {}
	} = $props();

	let isDragging = $state(false);
	/** @type {File | null} */
	let song = $state(null);
	/** @type {File[]} */
	let videos = $state([]);
	/** @type {File | null} */
	let stem = $state(null);
	let songInput = $state();
	let clipInput = $state();
	let stemInput = $state();

	const hasMedia = $derived(!!song || videos.length > 0);
	const canStart = $derived(!!song || videos.length > 0);

	function addVideos(files) {
		const list = Array.from(files || []);
		const seen = new Set(videos.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
		for (const file of list) {
			const key = `${file.name}:${file.size}:${file.lastModified}`;
			if (seen.has(key)) continue;
			seen.add(key);
			videos = [...videos, file];
		}
	}

	function handleDrop(event, kind) {
		event.preventDefault();
		event.stopPropagation();
		isDragging = false;
		const files = Array.from(event.dataTransfer?.files || []);
		if (kind === 'song' && files[0]) song = files[0];
		else if (kind === 'stem' && files[0]) stem = files[0];
		else if (kind === 'clips') addVideos(files.filter(isVideoFile));
	}

	function isVideoFile(file) {
		const name = file.name.toLowerCase();
		return file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/.test(name);
	}

	function isAudioFile(file) {
		const name = file.name.toLowerCase();
		return file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/.test(name);
	}

	function handleMixedDrop(event) {
		event.preventDefault();
		isDragging = false;
		for (const file of Array.from(event.dataTransfer?.files || [])) {
			if (isVideoFile(file)) addVideos([file]);
			else if (isAudioFile(file) && !song) song = file;
		}
	}

	function handleSongSelect(event) {
		const file = event.currentTarget.files?.[0];
		if (file) song = file;
		event.currentTarget.value = '';
	}

	function handleStemSelect(event) {
		const file = event.currentTarget.files?.[0];
		if (file) stem = file;
		event.currentTarget.value = '';
	}

	function handleClipSelect(event) {
		addVideos(event.currentTarget.files);
		event.currentTarget.value = '';
	}

	function start(mode) {
		onStart({ mode, songs: song ? [song] : [], videos, stems: stem ? [stem] : [] });
	}
</script>

<div
	class="flex h-full w-full flex-col items-center justify-center gap-8 overflow-y-auto p-8 transition-colors {isDragging
		? 'bg-violet-500/10'
		: ''}"
	role="region"
	aria-label="Media drop zone"
	ondragover={(e) => {
		e.preventDefault();
		isDragging = true;
	}}
	ondragleave={() => (isDragging = false)}
	ondrop={handleMixedDrop}
>
	<div class="text-center">
		<h1 class="mb-2 text-4xl font-bold tracking-tight">Video Shaders</h1>
		<p class="max-w-xl text-zinc-400">
			Add your full <span class="text-violet-400">song</span>, your
			<span class="text-violet-400">video clips</span>, and optionally an
			<span class="text-fuchsia-400">isolated vocal stem</span> for lyric transcription.
		</p>
	</div>

	<div class="grid w-full max-w-3xl gap-4 md:grid-cols-2">
		<!-- Song -->
		<div
			class="flex min-h-40 flex-col gap-3 rounded-2xl border-2 border-dashed p-5 transition-colors {isDragging
				? 'border-violet-400/60 bg-violet-500/5'
				: 'border-zinc-700 bg-zinc-900/40'}"
			role="group"
			aria-label="Song upload"
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => handleDrop(e, 'song')}
		>
			<div>
				<div class="text-sm font-medium text-zinc-200">Song</div>
				<p class="mt-1 text-xs text-zinc-500">Full mix — drives beats, sections, and playback.</p>
			</div>
			{#if song}
				<div
					class="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
				>
					<span class="truncate">{song.name}</span>
					<button
						type="button"
						class="shrink-0 text-zinc-500 hover:text-rose-400"
						aria-label="Remove song"
						onclick={() => (song = null)}>✕</button
					>
				</div>
			{:else}
				<p class="text-xs text-zinc-600">MP3, WAV, M4A…</p>
			{/if}
			<Button variant="outline" color="default" size="sm" on:click={() => songInput?.click()}>
				{song ? 'Replace song' : 'Browse song'}
			</Button>
		</div>

		<!-- Vocal stem -->
		<div
			class="flex min-h-40 flex-col gap-3 rounded-2xl border-2 border-dashed p-5 transition-colors {isDragging
				? 'border-fuchsia-400/60 bg-fuchsia-500/5'
				: 'border-fuchsia-900/60 bg-fuchsia-950/20'}"
			role="group"
			aria-label="Vocal stem upload"
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => handleDrop(e, 'stem')}
		>
			<div>
				<div class="text-sm font-medium text-fuchsia-200">Vocal stem</div>
				<p class="mt-1 text-xs text-zinc-500">
					Isolated vocals only — used for Deepgram lyrics. Not auto-detected; add it here.
				</p>
			</div>
			{#if stem}
				<div
					class="flex items-center justify-between gap-2 rounded-lg border border-fuchsia-900/50 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
				>
					<span class="truncate">{stem.name}</span>
					<button
						type="button"
						class="shrink-0 text-zinc-500 hover:text-rose-400"
						aria-label="Remove vocal stem"
						onclick={() => (stem = null)}>✕</button
					>
				</div>
			{:else}
				<p class="text-xs text-zinc-600">Optional · same formats as song</p>
			{/if}
			<Button variant="outline" color="default" size="sm" on:click={() => stemInput?.click()}>
				{stem ? 'Replace vocal stem' : 'Browse vocal stem'}
			</Button>
		</div>

		<!-- Clips -->
		<div
			class="flex min-h-44 flex-col gap-3 rounded-2xl border-2 border-dashed p-5 md:col-span-2 {isDragging
				? 'border-violet-400/60 bg-violet-500/5'
				: 'border-zinc-700 bg-zinc-900/40'}"
			role="group"
			aria-label="Video clips upload"
			ondragover={(e) => e.preventDefault()}
			ondrop={(e) => handleDrop(e, 'clips')}
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<div class="text-sm font-medium text-zinc-200">Video clips</div>
					<p class="mt-1 text-xs text-zinc-500">
						Select many at once — Cmd/Ctrl+click or Shift+click in the file picker.
					</p>
				</div>
				<Button variant="outline" color="default" size="sm" on:click={() => clipInput?.click()}>
					{videos.length > 0 ? `Add more (${videos.length})` : 'Browse clips'}
				</Button>
			</div>
			{#if videos.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each videos as file, i (file.name + i)}
						<span
							class="flex max-w-full items-center gap-1 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-200"
						>
							<span class="truncate">{file.name}</span>
							<button
								type="button"
								class="ml-1 shrink-0 text-zinc-500 hover:text-rose-400"
								aria-label="Remove {file.name}"
								onclick={() => (videos = videos.filter((_, idx) => idx !== i))}>✕</button
							>
						</span>
					{/each}
				</div>
			{:else}
				<p class="text-xs text-zinc-600">MP4, WebM, MOV… drop a folder of clips here too.</p>
			{/if}
		</div>
	</div>

	<input
		type="file"
		bind:this={songInput}
		onchange={handleSongSelect}
		accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
		class="sr-only"
	/>
	<input
		type="file"
		bind:this={clipInput}
		onchange={handleClipSelect}
		accept="video/*,.mp4,.webm,.mov,.m4v"
		multiple={true}
		class="sr-only"
	/>
	<input
		type="file"
		bind:this={stemInput}
		onchange={handleStemSelect}
		accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
		class="sr-only"
	/>

	<div class="flex items-center gap-4">
		<Button
			variant="fill"
			color="primary"
			size="lg"
			disabled={!canStart}
			on:click={() => start('autopilot')}
		>
			▶ Autopilot
		</Button>
		<Button
			variant="outline"
			color="default"
			size="lg"
			disabled={!canStart}
			on:click={() => start('studio')}
		>
			Studio
		</Button>
	</div>
	<p class="max-w-md text-center text-xs text-zinc-600">
		Autopilot runs analysis, lyrics (if stem provided), story plan, and auto edit. Studio lets you
		adjust each step — you can add a vocal stem later under Story.
	</p>
</div>
