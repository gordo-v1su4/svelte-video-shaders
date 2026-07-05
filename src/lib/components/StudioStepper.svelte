<script>
	/**
	 * Studio mode stepper. Steps unlock as their prerequisites complete but
	 * remain freely navigable once available.
	 */
	let {
		steps = [
			{ id: 'media', label: 'Media' },
			{ id: 'analysis', label: 'Analysis' },
			{ id: 'story', label: 'Story' },
			{ id: 'edit', label: 'Edit' },
			{ id: 'export', label: 'Export' }
		],
		activeStep = $bindable('media'),
		completed = {}
	} = $props();
</script>

<nav class="flex items-center gap-1 px-3 py-2">
	{#each steps as step, i (step.id)}
		{#if i > 0}
			<div class="h-px w-6 {completed[steps[i - 1].id] ? 'bg-violet-500/60' : 'bg-zinc-800'}"></div>
		{/if}
		<button
			type="button"
			class="flex items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors {activeStep ===
			step.id
				? 'bg-violet-500/20 text-violet-200'
				: 'text-zinc-500 hover:text-zinc-300'}"
			onclick={() => (activeStep = step.id)}
		>
			<span
				class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] {completed[step.id]
					? 'bg-emerald-500/80 text-black'
					: activeStep === step.id
						? 'bg-violet-500 text-black'
						: 'bg-zinc-800 text-zinc-500'}"
			>
				{completed[step.id] ? '✓' : i + 1}
			</span>
			{step.label}
		</button>
	{/each}
</nav>
