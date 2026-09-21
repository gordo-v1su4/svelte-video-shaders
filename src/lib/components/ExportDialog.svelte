<script>
	import { Button, Dialog } from 'svelte-ux';

	let {
		open = $bindable(false),
		progress = 0,
		status = '',
		error = '',
		resultUrl = '',
		fileName = 'video-shaders-export.mp4',
		onCancel = () => {},
		onClose = () => {}
	} = $props();

	const running = $derived(open && !resultUrl && !error);
</script>

<Dialog bind:open persistent={running} class="w-[420px]">
	<div slot="title">Export MP4</div>
	<div class="flex flex-col gap-4 px-6 pb-2">
		{#if error}
			<p class="text-sm text-rose-400">{error}</p>
		{:else if resultUrl}
			<p class="text-sm text-emerald-400">Export complete.</p>
			<video src={resultUrl} controls class="max-h-64 w-full rounded bg-black"></video>
		{:else}
			<div class="flex flex-col gap-2">
				<div class="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
					<div
						class="h-full rounded-full bg-violet-500 transition-all duration-200"
						style:width="{Math.round(progress * 100)}%"
					></div>
				</div>
				<div class="flex justify-between text-xs text-zinc-500">
					<span>{status}</span>
					<span class="metric">{Math.round(progress * 100)}%</span>
				</div>
			</div>
		{/if}
	</div>
	<div slot="actions">
		{#if resultUrl}
			<Button variant="fill" color="primary" href={resultUrl} download={fileName}>Download</Button>
			<Button variant="default" on:click={onClose}>Close</Button>
		{:else if error}
			<Button variant="default" on:click={onClose}>Close</Button>
		{:else}
			<Button variant="default" on:click={onCancel}>Cancel</Button>
		{/if}
	</div>
</Dialog>
