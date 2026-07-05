<script>
	import { ProgressCircle } from 'svelte-ux';

	/**
	 * @type {{ stages: Array<{id: string, label: string, detail?: string, status: 'pending'|'running'|'done'|'skipped'|'error'}> }}
	 */
	let { stages = [] } = $props();
</script>

<div class="flex flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur">
	<div class="mb-2 text-xs font-semibold tracking-widest text-violet-400 uppercase">Autopilot</div>
	{#each stages as stage (stage.id)}
		<div class="flex items-center gap-3 py-1.5">
			<div class="flex h-6 w-6 items-center justify-center">
				{#if stage.status === 'running'}
					<ProgressCircle size={20} width={2} class="text-violet-400" />
				{:else if stage.status === 'done'}
					<span class="text-emerald-400">✓</span>
				{:else if stage.status === 'skipped'}
					<span class="text-zinc-600">–</span>
				{:else if stage.status === 'error'}
					<span class="text-rose-400">!</span>
				{:else}
					<span class="h-2 w-2 rounded-full bg-zinc-700"></span>
				{/if}
			</div>
			<div class="min-w-0 flex-1">
				<div
					class="text-sm {stage.status === 'pending'
						? 'text-zinc-500'
						: stage.status === 'error'
							? 'text-rose-300'
							: 'text-zinc-100'}"
				>
					{stage.label}
				</div>
				{#if stage.detail}
					<div class="truncate text-xs text-zinc-500">{stage.detail}</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
