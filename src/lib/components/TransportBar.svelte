<script>
	import { Button } from 'svelte-ux';
	import { formatTime } from '$lib/playback-engine.js';

	let {
		isPlaying = false,
		currentTime = 0,
		duration = 0,
		bpm = 0,
		sectionLabel = 'song',
		beatActive = false,
		markerCounter = 0,
		markerSwapThreshold = 4,
		currentSpeed = 1,
		speedRampEnabled = false,
		exporting = false,
		onTogglePlayback = () => {},
		onRestart = () => {},
		onNextVideo = () => {},
		onPreviousVideo = () => {},
		onExport = () => {},
		onReset = () => {}
	} = $props();
</script>

<header class="flex h-12 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3">
	<div class="flex items-center gap-1.5">
		<span class="text-sm font-bold tracking-tight text-zinc-100">Video Shaders</span>
		<button
			type="button"
			class="rounded px-1.5 py-0.5 text-[10px] tracking-widest text-zinc-500 uppercase hover:text-zinc-300"
			title="Back to drop zone"
			onclick={onReset}>New</button
		>
	</div>

	<div class="mx-2 h-6 w-px bg-zinc-800"></div>

	<div class="flex items-center gap-1">
		<Button size="sm" variant="fill-light" color="primary" on:click={onTogglePlayback}>
			{isPlaying ? '⏸' : '▶'}
		</Button>
		<Button size="sm" variant="default" on:click={onRestart} title="Restart">⏮</Button>
		<Button size="sm" variant="default" on:click={onPreviousVideo} title="Previous clip">‹</Button>
		<Button size="sm" variant="default" on:click={onNextVideo} title="Next clip">›</Button>
	</div>

	<span class="metric text-sm text-zinc-300">
		{formatTime(currentTime)} <span class="text-zinc-600">/ {formatTime(duration)}</span>
	</span>

	<div class="mx-2 h-6 w-px bg-zinc-800"></div>

	<div class="flex items-center gap-2 text-xs">
		<span
			class="h-2.5 w-2.5 rounded-full transition-colors {beatActive
				? 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.9)]'
				: 'bg-zinc-700'}"
			title="Beat trigger"
		></span>
		<span class="metric text-zinc-500">{markerCounter}/{markerSwapThreshold}</span>
		<span
			class="rounded bg-zinc-800 px-2 py-0.5 text-[10px] tracking-wider text-violet-300 uppercase"
			>{sectionLabel}</span
		>
		{#if bpm > 0}
			<span class="metric text-zinc-400">{Math.round(bpm)} BPM</span>
		{/if}
		{#if speedRampEnabled}
			<span
				class="metric {currentSpeed > 1.5
					? 'text-rose-400'
					: currentSpeed < 0.8
						? 'text-sky-400'
						: 'text-zinc-400'}">{currentSpeed.toFixed(2)}x</span
			>
		{/if}
	</div>

	<div class="flex-1"></div>

	<Button size="sm" variant="fill" color="primary" loading={exporting} on:click={onExport}>
		Export MP4
	</Button>
</header>
