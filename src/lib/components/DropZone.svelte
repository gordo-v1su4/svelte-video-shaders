<script>
	import { Button } from 'svelte-ux';

	let {
		onStart = (
			/** @type {{ mode: 'autopilot' | 'studio', songs: File[], videos: File[], stems: File[] }} */ _payload
		) => {}
	} = $props();

	let isDragging = $state(false);
	/** @type {File[]} */
	let songs = $state([]);
	/** @type {File[]} */
	let videos = $state([]);
	/** @type {File[]} */
	let stems = $state([]);
	let fileInput = $state();

	const hasMedia = $derived(songs.length > 0 || videos.length > 0);
	const canStart = $derived(songs.length > 0 || videos.length > 0);

	function classify(files) {
		for (const file of files) {
			const name = file.name.toLowerCase();
			if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/.test(name)) {
				videos = [...videos, file];
			} else if (file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg)$/.test(name)) {
				const isStem = /(vocal|stem|acapella|voice)/i.test(name);
				if (isStem && songs.length > 0) {
					stems = [...stems, file];
				} else if (songs.length === 0) {
					songs = [...songs, file];
				} else {
					stems = [...stems, file];
				}
			}
		}
	}

	function handleDrop(event) {
		event.preventDefault();
		isDragging = false;
		classify(Array.from(event.dataTransfer?.files || []));
	}

	function handleFileSelect(event) {
		classify(Array.from(event.currentTarget.files || []));
		event.currentTarget.value = '';
	}

	function start(mode) {
		onStart({ mode, songs, videos, stems });
	}

	function removeFile(list, index) {
		if (list === 'songs') songs = songs.filter((_, i) => i !== index);
		else if (list === 'videos') videos = videos.filter((_, i) => i !== index);
		else stems = stems.filter((_, i) => i !== index);
	}
</script>

<div
	class="flex h-full w-full flex-col items-center justify-center gap-8 p-8 transition-colors {isDragging
		? 'bg-violet-500/10'
		: ''}"
	role="region"
	aria-label="Media drop zone"
	ondragover={(e) => {
		e.preventDefault();
		isDragging = true;
	}}
	ondragleave={() => (isDragging = false)}
	ondrop={handleDrop}
>
	<div class="text-center">
		<h1 class="mb-2 text-4xl font-bold tracking-tight">Video Shaders</h1>
		<p class="text-zinc-400">
			Drop a <span class="text-violet-400">song</span> and your
			<span class="text-violet-400">video clips</span> — add a vocal stem for lyric-driven stories.
		</p>
	</div>

	<button
		type="button"
		class="flex w-full max-w-2xl cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-12 py-16 transition-colors {isDragging
			? 'border-violet-400 bg-violet-500/10'
			: 'border-zinc-700 hover:border-zinc-500'}"
		onclick={() => fileInput?.click()}
	>
		<svg
			class="h-12 w-12 text-zinc-500"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="1.5"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
			/>
		</svg>
		<span class="text-lg text-zinc-300">Drop media here or click to browse</span>
		<span class="text-sm text-zinc-500"
			>MP4 / WebM clips · MP3 / WAV songs · optional vocal stem</span
		>
	</button>
	<input
		type="file"
		bind:this={fileInput}
		onchange={handleFileSelect}
		accept="video/*,audio/*"
		multiple
		hidden
	/>

	{#if hasMedia}
		<div class="flex w-full max-w-2xl flex-col gap-2">
			{#each [{ key: 'songs', label: 'Song', items: songs }, { key: 'stems', label: 'Vocal stem', items: stems }, { key: 'videos', label: 'Clips', items: videos }] as group (group.key)}
				{#if group.items.length > 0}
					<div class="flex flex-wrap items-center gap-2">
						<span class="w-24 text-xs tracking-wide text-zinc-500 uppercase">{group.label}</span>
						{#each group.items as file, i (file.name + i)}
							<span
								class="flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-200"
							>
								{file.name}
								<button
									type="button"
									class="ml-1 text-zinc-500 hover:text-rose-400"
									aria-label="Remove {file.name}"
									onclick={() => removeFile(group.key, i)}>✕</button
								>
							</span>
						{/each}
					</div>
				{/if}
			{/each}
		</div>
	{/if}

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
		Autopilot runs the whole chain — beat analysis, lyrics, story plan, auto edit — and lands on a
		finished preview. Studio gives you every step.
	</p>
</div>
