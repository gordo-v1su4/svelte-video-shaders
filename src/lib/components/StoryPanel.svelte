<script>
	import { Button } from 'svelte-ux';

	let {
		stem = null,
		stemBusy = false,
		canTranscribe = false,
		onStemSelect = (/** @type {File} */ _file) => {},
		onTranscribeStem = () => {},
		storyPlan = null,
		storyDirections = [],
		selectedDirectionIndex = $bindable(0),
		transcript = null,
		busy = false,
		onRegenerate = () => {}
	} = $props();

	let stemInput = $state();

	function handleStemPick(event) {
		const file = event.currentTarget.files?.[0];
		if (file) onStemSelect(file);
		event.currentTarget.value = '';
	}
</script>

<div class="flex flex-col gap-4">
	<div class="rounded-xl border border-fuchsia-900/50 bg-fuchsia-950/20 p-3">
		<div class="mb-1 text-xs font-semibold tracking-widest text-fuchsia-300 uppercase">
			Vocal stem
		</div>
		<p class="mb-3 text-xs text-zinc-500">
			Upload the isolated vocal track (not the full song). Deepgram uses this for lyrics and story
			beats.
		</p>
		{#if stem}
			<div
				class="mb-3 flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
			>
				<span class="truncate">{stem.name}</span>
				<button
					type="button"
					class="shrink-0 text-zinc-500 hover:text-rose-400"
					aria-label="Remove vocal stem"
					onclick={() => onStemSelect(null)}>✕</button
				>
			</div>
		{:else}
			<p class="mb-3 text-xs text-zinc-600">No vocal stem yet.</p>
		{/if}
		<div class="flex flex-wrap gap-2">
			<Button
				size="sm"
				variant="outline"
				color="default"
				loading={stemBusy}
				on:click={() => stemInput?.click()}
			>
				{stem ? 'Replace stem' : 'Upload vocal stem'}
			</Button>
			<Button
				size="sm"
				variant="fill"
				color="primary"
				disabled={!stem || !canTranscribe}
				loading={stemBusy}
				on:click={onTranscribeStem}
			>
				{transcript ? 'Re-transcribe lyrics' : 'Transcribe lyrics'}
			</Button>
		</div>
	</div>

	<span class="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Story</span>

	{#if transcript?.wordCount}
		<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
			<span class="text-zinc-200">{transcript.wordCount} words transcribed</span>
			{#if transcript.summary}
				<p class="mt-1 line-clamp-3">{transcript.summary}</p>
			{/if}
		</div>
	{/if}

	{#if storyDirections.length > 1}
		<div class="flex flex-col gap-1.5">
			<span class="text-xs text-zinc-500">Direction</span>
			{#each storyDirections as direction, i (i)}
				<button
					type="button"
					class="rounded-lg border px-3 py-2 text-left text-xs transition-colors {selectedDirectionIndex ===
					i
						? 'border-violet-500/60 bg-violet-500/10 text-zinc-100'
						: 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'}"
					onclick={() => (selectedDirectionIndex = i)}
				>
					<span class="font-medium">{direction.label || `Direction ${i + 1}`}</span>
					{#if direction.description}
						<p class="mt-0.5 text-zinc-500">{direction.description}</p>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	{#if storyPlan}
		<div class="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
			<div class="text-sm text-zinc-100">{storyPlan.title}</div>
			{#if storyPlan.logline}
				<p class="mt-1 text-xs text-zinc-500">{storyPlan.logline}</p>
			{/if}
		</div>

		<div class="panel-scroll flex max-h-64 flex-col gap-1.5 overflow-y-auto">
			{#each storyPlan.chunks || [] as chunk, i (i)}
				<div class="rounded-lg border border-zinc-800/70 bg-zinc-900/60 px-3 py-2">
					<div class="flex items-center justify-between text-[10px] text-zinc-600">
						<span class="tracking-wider uppercase">{chunk.sectionLabel || 'scene'}</span>
						<span class="metric">{Math.floor(chunk.start || 0)}s</span>
					</div>
					{#if chunk.text}
						<p class="mt-0.5 text-xs text-zinc-300 italic">“{chunk.text}”</p>
					{/if}
					{#if chunk.prompt}
						<p class="mt-1 line-clamp-2 text-[11px] text-zinc-500">{chunk.prompt}</p>
					{/if}
				</div>
			{/each}
		</div>

		<Button size="sm" variant="outline" loading={busy} on:click={onRegenerate}
			>Regenerate story</Button
		>
	{:else}
		<p class="text-xs text-zinc-600">
			After song analysis, upload a vocal stem above and run transcription to build lyric-driven
			story beats.
		</p>
	{/if}

	<input
		type="file"
		bind:this={stemInput}
		onchange={handleStemPick}
		accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg"
		class="sr-only"
	/>
</div>
