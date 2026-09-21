<script>
	import ShaderBrowser from './ShaderBrowser.svelte';
	import ClipBuckets from './ClipBuckets.svelte';
	import TriggerControls from './TriggerControls.svelte';
	import StoryPanel from './StoryPanel.svelte';

	let {
		activeTab = $bindable('fx'),
		// ShaderBrowser
		selectedShaderId = $bindable('VHS'),
		selectedPresetId = $bindable(''),
		uniforms = $bindable({}),
		filtersEnabled = $bindable(true),
		hasAudio = false,
		hasVideo = false,
		bpm = 0,
		energy = null,
		onSelectShader = () => {},
		onApplyPreset = () => {},
		// ClipBuckets
		sections = [],
		clips = [],
		sectionVideoPools = $bindable({}),
		sectionColorPalette = [],
		selectedSectionIndex = $bindable(-1),
		activeSectionIndex = -1,
		onPreviewClip = () => {},
		// TriggerControls
		triggerSource = $bindable('onsets'),
		hasMidi = false,
		hasOnsets = false,
		onsetCount = 0,
		beatCount = 0,
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
		hasEnergyCurve = false,
		// StoryPanel
		storyPlan = null,
		storyDirections = [],
		selectedDirectionIndex = $bindable(0),
		transcript = null,
		storyBusy = false,
		stem = null,
		stemBusy = false,
		canTranscribe = false,
		onStemSelect = () => {},
		onTranscribeStem = () => {},
		onRegenerateStory = () => {}
	} = $props();

	const tabs = [
		{ id: 'fx', label: 'FX' },
		{ id: 'pools', label: 'Sections' },
		{ id: 'triggers', label: 'Triggers' },
		{ id: 'story', label: 'Story' }
	];
</script>

<aside class="flex h-full w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
	<div class="flex border-b border-zinc-800">
		{#each tabs as tab (tab.id)}
			<button
				type="button"
				class="flex-1 px-2 py-2.5 text-xs font-medium tracking-wide uppercase transition-colors {activeTab ===
				tab.id
					? 'border-b-2 border-violet-400 text-violet-300'
					: 'text-zinc-500 hover:text-zinc-300'}"
				onclick={() => (activeTab = tab.id)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	<div class="panel-scroll flex-1 overflow-y-auto p-4">
		{#if activeTab === 'fx'}
			<ShaderBrowser
				bind:selectedShaderId
				bind:selectedPresetId
				bind:uniforms
				bind:filtersEnabled
				{hasAudio}
				{hasVideo}
				{bpm}
				{energy}
				{onSelectShader}
				{onApplyPreset}
			/>
		{:else if activeTab === 'pools'}
			<ClipBuckets
				{sections}
				{clips}
				bind:sectionVideoPools
				{sectionColorPalette}
				bind:selectedSectionIndex
				activeSectionIndex={activeSectionIndex}
				{onPreviewClip}
			/>
		{:else if activeTab === 'triggers'}
			<TriggerControls
				bind:triggerSource
				{hasMidi}
				{hasOnsets}
				{bpm}
				{onsetCount}
				{beatCount}
				{sections}
				bind:markerDensity
				bind:markerSwapThreshold
				bind:randomSkip
				bind:fxIntensity
				bind:fxDecay
				bind:jumpCuts
				bind:speedRampEnabled
				bind:speedMin
				bind:speedMax
				bind:speedSmoothing
				{hasEnergyCurve}
			/>
		{:else if activeTab === 'story'}
			<StoryPanel
				{stem}
				{stemBusy}
				{canTranscribe}
				{onStemSelect}
				{onTranscribeStem}
				{storyPlan}
				{storyDirections}
				bind:selectedDirectionIndex
				{transcript}
				busy={storyBusy}
				onRegenerate={onRegenerateStory}
			/>
		{/if}
	</div>
</aside>
