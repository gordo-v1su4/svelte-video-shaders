<script>
	import { Button, TextField } from 'svelte-ux';
	import {
		filterShaders,
		getShaderById,
		getSmartShaderSuggestions,
		shaderCategories
	} from '$lib/shader-catalog.js';

	let {
		selectedShaderId = $bindable('VHS'),
		selectedPresetId = $bindable(''),
		uniforms = $bindable({}),
		filtersEnabled = $bindable(true),
		hasAudio = false,
		hasVideo = false,
		bpm = 0,
		energy = null,
		onSelectShader = (/** @type {string} */ _shaderId) => {},
		onApplyPreset = (/** @type {string} */ _shaderId, /** @type {string} */ _presetId) => {}
	} = $props();

	let category = $state('Featured');
	let search = $state('');

	const visible = $derived(filterShaders({ category, search, hasAudio }));
	const suggestions = $derived(getSmartShaderSuggestions({ hasVideo, hasAudio, bpm, energy }));
	const selectedShader = $derived(getShaderById(selectedShaderId));

	/**
	 * Slider ranges inferred from the default value scale - keeps auto-generated
	 * controls usable without hand-tuning every uniform.
	 */
	function rangeFor(key, defaultValue) {
		const v = Math.abs(Number(defaultValue) || 0);
		if (key.includes('angle') || key.includes('rotation'))
			return { min: -3.14, max: 3.14, step: 0.01 };
		if (v === 0) return { min: -1, max: 1, step: 0.01 };
		if (v <= 0.01) return { min: 0, max: 0.05, step: 0.0005 };
		if (v <= 0.1) return { min: 0, max: 1, step: 0.005 };
		if (v <= 1) return { min: 0, max: Math.max(1, v * 2.5), step: 0.01 };
		if (v <= 10) return { min: 0, max: Math.ceil(v * 3), step: 0.1 };
		return { min: 0, max: Math.ceil(v * 3), step: 1 };
	}

	const paramControls = $derived.by(() => {
		const controls = [];
		for (const control of selectedShader.controls || []) {
			const uniform = uniforms[control.key];
			if (!uniform) continue;
			const value = uniform.value;
			if (typeof value === 'number') {
				const def = selectedShader.defaultUniforms?.[control.key]?.value ?? value;
				controls.push({ ...control, kind: 'number', ...rangeFor(control.key, def) });
			} else if (Array.isArray(value) && value.length <= 3) {
				controls.push({ ...control, kind: 'vector', size: value.length });
			}
		}
		return controls;
	});
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between">
		<span class="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Shader FX</span>
		<label class="flex items-center gap-2 text-xs text-zinc-400">
			<input type="checkbox" bind:checked={filtersEnabled} class="accent-violet-500" />
			Enabled
		</label>
	</div>

	{#if suggestions.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each suggestions as shader (shader.id)}
				<button
					type="button"
					class="rounded-full border px-2.5 py-0.5 text-[11px] transition-colors {selectedShaderId ===
					shader.id
						? 'border-violet-400 bg-violet-500/20 text-violet-200'
						: 'border-zinc-700 text-zinc-400 hover:border-zinc-500'}"
					onclick={() => onSelectShader(shader.id)}
				>
					✦ {shader.label}
				</button>
			{/each}
		</div>
	{/if}

	<TextField bind:value={search} placeholder="Search shaders..." dense clearable />

	<div class="flex flex-wrap gap-1">
		{#each shaderCategories as cat (cat)}
			<button
				type="button"
				class="rounded px-2 py-0.5 text-[11px] transition-colors {category === cat
					? 'bg-violet-500/25 text-violet-200'
					: 'text-zinc-500 hover:text-zinc-300'}"
				onclick={() => (category = cat)}
			>
				{cat}
			</button>
		{/each}
	</div>

	<div class="panel-scroll flex max-h-56 flex-col gap-1 overflow-y-auto">
		{#each visible as shader (shader.id)}
			<button
				type="button"
				class="rounded-lg border px-3 py-2 text-left transition-colors {selectedShaderId ===
				shader.id
					? 'border-violet-500/60 bg-violet-500/10'
					: 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'}"
				onclick={() => onSelectShader(shader.id)}
			>
				<div class="flex items-center justify-between">
					<span class="text-sm text-zinc-100">{shader.label}</span>
					<span class="text-[10px] text-zinc-600 uppercase">{shader.performance}</span>
				</div>
				<div class="truncate text-xs text-zinc-500">{shader.description}</div>
			</button>
		{/each}
		{#if visible.length === 0}
			<div class="py-4 text-center text-xs text-zinc-600">No shaders match</div>
		{/if}
	</div>

	{#if selectedShader.presets?.length > 0}
		<div class="flex flex-wrap gap-1.5">
			{#each selectedShader.presets as preset (preset.id)}
				<Button
					size="sm"
					variant={selectedPresetId === preset.id ? 'fill-light' : 'outline'}
					color={selectedPresetId === preset.id ? 'primary' : 'default'}
					on:click={() => onApplyPreset(selectedShader.id, preset.id)}
				>
					{preset.label}
				</Button>
			{/each}
		</div>
	{/if}

	{#if paramControls.length > 0}
		<div class="flex flex-col gap-2 border-t border-zinc-800 pt-3">
			<span class="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Parameters</span>
			{#each paramControls as control (control.key)}
				{#if control.kind === 'number'}
					<label class="flex flex-col gap-1">
						<span class="flex justify-between text-xs">
							<span class="text-zinc-400 capitalize">{control.label}</span>
							<span class="metric text-zinc-500"
								>{Number(uniforms[control.key].value).toFixed(3)}</span
							>
						</span>
						<input
							type="range"
							class="accent-violet-500"
							min={control.min}
							max={control.max}
							step={control.step}
							bind:value={uniforms[control.key].value}
						/>
					</label>
				{:else if control.kind === 'vector'}
					<div class="flex flex-col gap-1">
						<span class="text-xs text-zinc-400 capitalize">{control.label}</span>
						<div class="flex gap-2">
							{#each uniforms[control.key].value as _, axis (axis)}
								<input
									type="range"
									class="min-w-0 flex-1 accent-violet-500"
									min={control.size === 3 ? 0 : -1}
									max={control.size === 3 ? 1 : 1}
									step="0.01"
									bind:value={uniforms[control.key].value[axis]}
								/>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
