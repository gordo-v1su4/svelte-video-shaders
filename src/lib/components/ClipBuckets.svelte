<script>
	import { getFilmstrip } from '$lib/media/filmstrip.js';

	/**
	 * Section clip pools: which clips can play during each song section.
	 * `sectionVideoPools` maps sectionIndex -> number[] of clip indices.
	 */
	let {
		sections = [],
		clips = [],
		sectionVideoPools = $bindable({}),
		sectionColorPalette = [],
		selectedSectionIndex = $bindable(-1),
		onPreviewClip = (/** @type {number} */ _clipIndex) => {}
	} = $props();

	/** @type {Record<string, string>} first filmstrip tile per clip name */
	let thumbs = $state({});

	$effect(() => {
		for (const clip of clips) {
			if (!clip.file || thumbs[clip.name]) continue;
			getFilmstrip(clip.file, {
				fps: 1,
				maxTiles: 4,
				onTile: (tile) => {
					if (!thumbs[clip.name]) thumbs = { ...thumbs, [clip.name]: tile.url };
				}
			}).catch(() => {});
		}
	});

	function poolFor(sectionIndex) {
		const pool = sectionVideoPools[sectionIndex];
		return Array.isArray(pool) && pool.length > 0 ? pool : clips.map((_, i) => i);
	}

	function toggleClip(sectionIndex, clipIndex) {
		const current = poolFor(sectionIndex);
		let next;
		if (current.includes(clipIndex)) {
			next = current.filter((i) => i !== clipIndex);
			if (next.length === 0) next = clips.map((_, i) => i); // never leave a section empty
		} else {
			next = [...current, clipIndex].sort((a, b) => a - b);
		}
		sectionVideoPools = { ...sectionVideoPools, [sectionIndex]: next };
	}

	function colorFor(index) {
		return sectionColorPalette[index % Math.max(1, sectionColorPalette.length)] || '#8b5cf6';
	}
</script>

<div class="flex flex-col gap-3">
	<span class="text-xs font-semibold tracking-widest text-zinc-500 uppercase"
		>Section Clip Pools</span
	>

	{#if sections.length === 0}
		<p class="text-xs text-zinc-600">
			Run analysis to detect song sections, then assign clips per section.
		</p>
	{:else}
		<div class="flex flex-wrap gap-1.5">
			{#each sections as section, i (i)}
				<button
					type="button"
					class="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
					style:border-color={selectedSectionIndex === i ? colorFor(i) : 'transparent'}
					style:background-color={`${colorFor(i)}${selectedSectionIndex === i ? '44' : '22'}`}
					onclick={() => (selectedSectionIndex = selectedSectionIndex === i ? -1 : i)}
				>
					<span style:color={colorFor(i)}
						>{(section.label || `Section ${i + 1}`).toUpperCase()}</span
					>
					<span class="ml-1 text-zinc-500">{poolFor(i).length}/{clips.length}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if clips.length === 0}
		<p class="text-xs text-zinc-600">No clips loaded.</p>
	{:else}
		<div class="panel-scroll grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
			{#each clips as clip, clipIndex (clip.name + clipIndex)}
				{@const inPool =
					selectedSectionIndex < 0 || poolFor(selectedSectionIndex).includes(clipIndex)}
				<div
					class="group relative overflow-hidden rounded-lg border transition-all {inPool
						? 'border-zinc-700'
						: 'border-zinc-800 opacity-35'}"
				>
					<button
						type="button"
						class="block aspect-video w-full bg-zinc-900"
						title={selectedSectionIndex >= 0 ? 'Toggle in section pool' : 'Preview clip'}
						onclick={() =>
							selectedSectionIndex >= 0
								? toggleClip(selectedSectionIndex, clipIndex)
								: onPreviewClip(clipIndex)}
					>
						{#if thumbs[clip.name]}
							<img src={thumbs[clip.name]} alt={clip.name} class="h-full w-full object-cover" />
						{:else}
							<div class="flex h-full w-full items-center justify-center text-xs text-zinc-700">
								Loading…
							</div>
						{/if}
					</button>
					<div
						class="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/90 to-transparent px-2 pt-4 pb-1 text-[10px] text-zinc-300"
					>
						{clip.name}
					</div>
					{#if selectedSectionIndex >= 0 && inPool}
						<div
							class="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-black"
							style:background-color={colorFor(selectedSectionIndex)}
						>
							✓
						</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if selectedSectionIndex >= 0}
			<p class="text-[11px] text-zinc-600">
				Click clips to include or exclude them from
				<span style:color={colorFor(selectedSectionIndex)}
					>{(sections[selectedSectionIndex]?.label || 'section').toUpperCase()}</span
				>.
			</p>
		{/if}
	{/if}
</div>
