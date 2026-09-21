<script>
	let {
		triggerSource = $bindable('onsets'), // 'onsets' | 'midi' | 'grid' | 'off'
		hasMidi = false,
		hasOnsets = false,
		bpm = 0,
		onsetCount = 0,
		beatCount = 0,
		sections = [],
		markerDensity = $bindable(0.6),
		markerSwapThreshold = $bindable(4),
		randomSkip = $bindable(false),
		fxIntensity = $bindable(0.5),
		fxDecay = $bindable(0.12),
		jumpCuts = $bindable(false),
		speedRampEnabled = $bindable(false),
		speedMin = $bindable(0.8),
		speedMax = $bindable(1.8),
		speedSmoothing = $bindable(0.15),
		hasEnergyCurve = false
	} = $props();

	const sources = $derived([
		{ id: 'onsets', label: 'Onsets', disabled: !hasOnsets },
		{ id: 'midi', label: 'MIDI', disabled: !hasMidi },
		{ id: 'grid', label: 'Grid', disabled: false },
		{ id: 'off', label: 'Off', disabled: false }
	]);
</script>

<div class="flex flex-col gap-3">
	<span class="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Beat Triggers</span>

	{#if bpm > 0 || sections.length > 0}
		<div class="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5 text-[11px] text-zinc-400">
			{#if bpm > 0}
				<div class="flex justify-between">
					<span>BPM</span>
					<span class="metric text-zinc-200">{Math.round(bpm)}</span>
				</div>
			{/if}
			<div class="mt-1 flex justify-between">
				<span>Onsets detected</span>
				<span class="metric text-zinc-200">{onsetCount}</span>
			</div>
			{#if sections.length > 0}
				<div class="mt-2 border-t border-zinc-800 pt-2">
					<div class="mb-1 text-zinc-500">Song sections</div>
					<div class="flex flex-wrap gap-1">
						{#each sections as section, i (i)}
							<span
								class="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300 uppercase"
								title="{Math.floor(section.start)}s – {Math.floor(section.end)}s"
							>
								{section.label || `S${i + 1}`}
							</span>
						{/each}
					</div>
				</div>
			{:else}
				<p class="mt-1 text-zinc-600">No sections — re-run analysis or check Essentia connection.</p>
			{/if}
			{#if !hasOnsets}
				<p class="mt-1 text-amber-500/90">Onset markers hidden — analysis may have failed.</p>
			{/if}
		</div>
	{/if}

	<div class="flex gap-1">
		{#each sources as source (source.id)}
			<button
				type="button"
				disabled={source.disabled}
				class="flex-1 rounded px-2 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 {triggerSource ===
				source.id
					? 'bg-violet-500/25 text-violet-200'
					: 'bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'}"
				onclick={() => (triggerSource = source.id)}
			>
				{source.label}
			</button>
		{/each}
	</div>

	<label class="flex flex-col gap-1">
		<span class="flex justify-between text-xs">
			<span class="text-zinc-400">Marker density</span>
			<span class="metric text-zinc-500">{markerDensity.toFixed(2)}</span>
		</span>
		<input
			type="range"
			min="0.05"
			max="1"
			step="0.05"
			bind:value={markerDensity}
			class="accent-violet-500"
		/>
	</label>

	<label class="flex flex-col gap-1">
		<span class="flex justify-between text-xs">
			<span class="text-zinc-400">Clip swap every N hits</span>
			<span class="metric text-zinc-500">{markerSwapThreshold}</span>
		</span>
		<input
			type="range"
			min="1"
			max="16"
			step="1"
			bind:value={markerSwapThreshold}
			class="accent-violet-500"
		/>
	</label>

	<label class="flex flex-col gap-1">
		<span class="flex justify-between text-xs">
			<span class="text-zinc-400">FX hit intensity</span>
			<span class="metric text-zinc-500">{fxIntensity.toFixed(2)}</span>
		</span>
		<input
			type="range"
			min="0"
			max="1"
			step="0.05"
			bind:value={fxIntensity}
			class="accent-violet-500"
		/>
	</label>

	<label class="flex flex-col gap-1">
		<span class="flex justify-between text-xs">
			<span class="text-zinc-400">FX decay</span>
			<span class="metric text-zinc-500">{fxDecay.toFixed(2)}s</span>
		</span>
		<input
			type="range"
			min="0.02"
			max="0.5"
			step="0.01"
			bind:value={fxDecay}
			class="accent-violet-500"
		/>
	</label>

	<div class="flex flex-col gap-2 text-xs text-zinc-400">
		<label class="flex items-center justify-between">
			Random skip
			<input type="checkbox" bind:checked={randomSkip} class="accent-violet-500" />
		</label>
		<label class="flex items-center justify-between">
			Jump cuts inside clips
			<input type="checkbox" bind:checked={jumpCuts} class="accent-violet-500" />
		</label>
	</div>

	<div class="border-t border-zinc-800 pt-3">
		<label class="flex items-center justify-between text-xs text-zinc-400">
			<span class="font-semibold tracking-widest text-zinc-500 uppercase">Speed ramp</span>
			<input
				type="checkbox"
				bind:checked={speedRampEnabled}
				disabled={!hasEnergyCurve}
				class="accent-violet-500"
			/>
		</label>
		{#if !hasEnergyCurve}
			<p class="mt-1 text-[11px] text-zinc-600">Needs energy curve from song analysis.</p>
		{:else if speedRampEnabled}
			<div class="mt-2 flex flex-col gap-2">
				<label class="flex flex-col gap-1">
					<span class="flex justify-between text-xs">
						<span class="text-zinc-400">Min / max speed</span>
						<span class="metric text-zinc-500">{speedMin.toFixed(2)}x – {speedMax.toFixed(2)}x</span
						>
					</span>
					<div class="flex gap-2">
						<input
							type="range"
							min="0.3"
							max="1"
							step="0.05"
							bind:value={speedMin}
							class="flex-1 accent-violet-500"
						/>
						<input
							type="range"
							min="1"
							max="3"
							step="0.05"
							bind:value={speedMax}
							class="flex-1 accent-violet-500"
						/>
					</div>
				</label>
				<label class="flex flex-col gap-1">
					<span class="flex justify-between text-xs">
						<span class="text-zinc-400">Smoothing</span>
						<span class="metric text-zinc-500">{speedSmoothing.toFixed(2)}</span>
					</span>
					<input
						type="range"
						min="0.02"
						max="0.5"
						step="0.01"
						bind:value={speedSmoothing}
						class="accent-violet-500"
					/>
				</label>
			</div>
		{/if}
	</div>
</div>
