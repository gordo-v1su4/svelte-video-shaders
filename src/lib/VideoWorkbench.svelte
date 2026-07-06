<script>
	import { tick } from 'svelte';
	import ShaderPlayer from '$lib/ShaderPlayer.svelte';
	import PeaksPlayer from '$lib/PeaksPlayer.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import AutopilotRail from '$lib/components/AutopilotRail.svelte';
	import TransportBar from '$lib/components/TransportBar.svelte';
	import StudioStepper from '$lib/components/StudioStepper.svelte';
	import Inspector from '$lib/components/Inspector.svelte';
	import ExportDialog from '$lib/components/ExportDialog.svelte';

	import { clipPool } from '$lib/media/clip-pool.js';
	import { videoSourcePool } from '$lib/media/video-source-pool.js';
	import { clearFilmstripCache } from '$lib/media/filmstrip.js';
	import {
		TARGET_FPS,
		Clock,
		TriggerScheduler,
		filterMarkersByDensity,
		computeGridMarkers,
		preprocessSpeedCurve,
		sampleSpeedCurve,
		sectionAtTime,
		seededRandom
	} from '$lib/playback-engine.js';
	import { poolForSection } from '$lib/export/edit-timeline.js';
	import { exportVideo } from '$lib/export/video-export.js';
	import { AUTOPILOT_STAGES, runAutopilot, runLyricsPipeline, mergeKimiStoryIntoPlan } from '$lib/autopilot.js';
	import { EssentiaService } from '$lib/essentia-service.js';
	import { transcribeAudioWithDeepgram } from '$lib/deepgram-utils.js';
	import { requestKimiStoryGeneration } from '$lib/kimi-story-engine.js';
	import { AudioAnalyzer } from '$lib/audio-utils.js';
	import { shaderCatalog, getShaderById, applyPresetToUniforms } from '$lib/shader-catalog.js';

	const SECTION_COLORS = [
		'#f59e0b',
		'#60a5fa',
		'#f472b6',
		'#4ade80',
		'#a78bfa',
		'#22d3ee',
		'#fb7185',
		'#fbbf24'
	];
	const JUMP_CUT_RANGE = 30;

	// --- Mode & media ---
	let appMode = $state('landing'); // 'landing' | 'autopilot' | 'studio'
	/** @type {File | null} */
	let song = $state(null);
	/** @type {File | null} */
	let stem = $state(null);
	/** @type {File[]} */
	let videoFiles = $state([]);
	/** @type {HTMLAudioElement | null} */
	let audioEl = $state(null);
	let mediaLoading = $state(false);
	let loadStatus = $state('');

	const clipList = $derived(videoFiles.map((file) => ({ name: file.name, file })));

	// --- Analysis / pipeline ---
	let analysis = $state(null);
	let transcript = $state(null);
	let storyPlan = $state(null);
	let storyDirections = $state([]);
	let selectedDirectionIndex = $state(0);
	let storyBusy = $state(false);
	let stemBusy = $state(false);
	let stageStates = $state([]);
	let autopilotRunning = $state(false);
	let pipelineChunks = [];
	let seed = $state(1);

	const sections = $derived(analysis?.structure?.sections || []);

	// --- Edit settings ---
	let triggerSource = $state('onsets');
	let markerDensity = $state(0.6);
	let markerSwapThreshold = $state(4);
	let randomSkip = $state(false);
	let fxIntensity = $state(0.5);
	let fxDecay = $state(0.12);
	let jumpCuts = $state(false);
	let speedRampEnabled = $state(false);
	let speedMin = $state(0.85);
	let speedMax = $state(1.45);
	let speedSmoothing = $state(0.18);
	/** @type {Record<number, number[]>} */
	let sectionVideoPools = $state({});
	let selectedSectionIndex = $state(-1);

	// --- Shader ---
	let selectedShaderId = $state('VHS');
	let selectedPresetId = $state('');
	let uniforms = $state({});
	let filtersEnabled = $state(true);
	const fragmentShader = $derived(getShaderById(selectedShaderId).fragmentShader);

	// --- Playback ---
	/** @type {ShaderPlayer | null} */
	let playerRef = $state(null);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let currentClipIndex = $state(0);
	let currentSectionIndex = -1;
	let markerCounter = $state(0);
	let beatActive = $state(false);
	let currentSpeed = $state(1);
	let fxBoost = 0;
	let beatFlashTimer = 0;
	const scheduler = new TriggerScheduler();
	/** @type {AudioAnalyzer | null} */
	let analyzer = null;

	// --- Studio stepper / inspector ---
	let activeStep = $state('media');
	let inspectorTab = $state('fx');

	// --- Export ---
	let exportOpen = $state(false);
	let exportProgress = $state(0);
	let exportStatus = $state('');
	let exportError = $state('');
	let exportUrl = $state('');
	/** @type {AbortController | null} */
	let exportAbort = null;

	const speedCurve = $derived.by(() => {
		const curve = analysis?.energy?.curve;
		if (!curve || curve.length === 0 || !duration) return null;
		return preprocessSpeedCurve(curve, {
			duration,
			minSpeed: speedMin,
			maxSpeed: speedMax,
			smoothing: speedSmoothing,
			punch: 1.4
		});
	});
	const speedRampActive = $derived(speedRampEnabled && !!speedCurve);

	const activeTriggers = $derived.by(() => {
		if (triggerSource === 'off' || !duration) return [];
		let source = [];
		if (triggerSource === 'onsets') source = analysis?.onsets || [];
		else if (triggerSource === 'grid') {
			source =
				analysis?.beats?.length > 0
					? analysis.beats
					: computeGridMarkers({ bpm: analysis?.bpm || 120, duration, beats: [] }).filter(
							(_, i) => i % 8 === 0
						);
		}
		return filterMarkersByDensity(source, {
			density: markerDensity,
			bpm: analysis?.bpm || 120,
			randomSkip,
			skipChance: 0.3,
			seedOffset: seed,
			maxDuration: duration
		});
	});

	const stepCompleted = $derived({
		media: videoFiles.length > 0 && !!song,
		analysis: sections.length > 0 || (analysis?.bpm || 0) > 0,
		story: !!storyPlan,
		edit: stageStates.some((s) => s.id === 'edit' && s.status === 'done'),
		export: !!exportUrl
	});

	// Studio stepper drives which inspector panel is front and center
	$effect(() => {
		if (appMode !== 'studio') return;
		const map = { media: 'pools', analysis: 'triggers', story: 'story', edit: 'fx', export: 'fx' };
		inspectorTab = map[activeStep] || 'fx';
	});

	function cloneUniforms(defaults) {
		const out = {};
		for (const key in defaults || {}) {
			const value = defaults[key].value;
			out[key] = { value: Array.isArray(value) ? [...value] : value };
		}
		return out;
	}

	function uniformSnapshot() {
		return cloneUniforms(uniforms);
	}

	function selectShader(shaderId, presetId = '') {
		selectedShaderId = shaderId;
		uniforms = cloneUniforms(getShaderById(shaderId).defaultUniforms);
		selectedPresetId = '';
		if (presetId) applyPreset(shaderId, presetId);
	}

	function applyPreset(shaderId, presetId) {
		const next = cloneUniforms(uniforms);
		applyPresetToUniforms(next, shaderId, presetId);
		uniforms = next;
		selectedPresetId = presetId;
	}

	function findShaderByPresetId(presetId) {
		return shaderCatalog.find((shader) => shader.presets.some((p) => p.id === presetId)) || null;
	}

	// === Media loading ===

	async function handleStart({ mode, songs, videos, stems }) {
		song = songs[0] || null;
		stem = stems[0] || null;
		videoFiles = videos;
		appMode = mode;
		await tick(); // audio element + player mount

		mediaLoading = true;
		if (song && audioEl) {
			if (audioEl.src) URL.revokeObjectURL(audioEl.src);
			audioEl.src = URL.createObjectURL(song);
			audioEl.load();
			await new Promise((resolve) => {
				const done = () => {
					audioEl.removeEventListener('loadedmetadata', done);
					resolve();
				};
				if (audioEl.readyState >= 1) resolve();
				else audioEl.addEventListener('loadedmetadata', done);
			});
			duration = audioEl.duration || 0;
		}

		if (videoFiles.length > 0) {
			loadStatus = 'Loading video clips...';
			await videoSourcePool.loadClips(videoFiles, (progress, status) => {
				loadStatus = status;
			});
			await videoSourcePool.ensureAllPrimed();
			await videoSourcePool.ensureClipReady(0);
			currentClipIndex = 0;
			playerRef?.seekToClip(0, 0, false);
		}
		mediaLoading = false;

		selectShader(selectedShaderId);
		runPipeline();
	}

	// === Pipeline (Autopilot + Studio share it) ===

	async function runPipeline() {
		if (!song) {
			stageStates = AUTOPILOT_STAGES.map((s) => ({ ...s, status: 'skipped', detail: 'No song' }));
			return;
		}
		stageStates = AUTOPILOT_STAGES.map((s) => ({ ...s, status: 'pending' }));
		autopilotRunning = true;

		const essentia = new EssentiaService();
		await essentia.initialize();

		try {
			const result = await runAutopilot(
				{
					song,
					stem,
					videoAssets: videoFiles.map((file, i) => ({ id: String(i), file, name: file.name })),
					duration
				},
				{
					services: {
						analyze: (file) => essentia.analyzeFile(file),
						transcribe: (file, opts) => transcribeAudioWithDeepgram(file, opts),
						story: (payload) => requestKimiStoryGeneration(payload)
					},
					onStage: (id, status, detail) => {
						stageStates = stageStates.map((s) =>
							s.id === id ? { ...s, status, detail: detail ?? s.detail } : s
						);
					},
					presetId: 'balanced-music-video',
					seed
				}
			);
			applyPipelineResult(result);
		} catch (err) {
			console.error('[Autopilot] pipeline failed:', err);
			stageStates = stageStates.map((s) =>
				s.status === 'running' ? { ...s, status: 'error', detail: String(err?.message || err) } : s
			);
		}
		autopilotRunning = false;

		if (appMode === 'autopilot') {
			if (videoFiles.length > 0) await videoSourcePool.ensureAllPrimed();
			restart();
			await tick();
			isPlaying = true;
		}
	}

	function applyPipelineResult(result) {
		analysis = result.analysis;
		transcript = result.transcript;
		storyPlan = result.storyPlan;
		storyDirections = result.storyDirections || [];
		pipelineChunks = result.chunks || [];

		const plan = result.editPlan;
		if (plan?.ready) {
			markerSwapThreshold = plan.triggerSettings.markerThreshold;
			fxIntensity = plan.triggerSettings.intensity;
			fxDecay = Math.max(0.05, plan.triggerSettings.decay);
			jumpCuts = plan.triggerSettings.jumpCuts;
			if (plan.speedRamp?.enabled && analysis?.energy?.curve?.length) {
				speedRampEnabled = true;
				speedMin = plan.speedRamp.min;
				speedMax = plan.speedRamp.max;
				speedSmoothing = plan.speedRamp.smoothing;
			}
			const firstPreset = plan.shaderPresetIds?.[0];
			const owner = firstPreset ? findShaderByPresetId(firstPreset) : null;
			if (owner) selectShader(owner.id, firstPreset);
		}

		// Every section starts with all clips available; users prune in Studio.
		const pools = {};
		(analysis?.structure?.sections || []).forEach((_, i) => {
			pools[i] = videoFiles.map((_, ci) => ci);
		});
		sectionVideoPools = pools;
	}

	async function regenerateStory() {
		if (!storyPlan || pipelineChunks.length === 0) return;
		storyBusy = true;
		try {
			const remote = await requestKimiStoryGeneration({ chunks: pipelineChunks, storyPlan });
			if (remote?.success) storyPlan = mergeKimiStoryIntoPlan(storyPlan, remote);
		} catch (err) {
			console.warn('[Story] regeneration failed:', err);
		}
		storyBusy = false;
	}

	function pipelineServices() {
		const essentia = new EssentiaService();
		return {
			analyze: (file) => essentia.analyzeFile(file),
			transcribe: (file, opts) => transcribeAudioWithDeepgram(file, opts),
			story: (payload) => requestKimiStoryGeneration(payload)
		};
	}

	function handleStemSelect(file) {
		stem = file;
		if (file && appMode === 'studio') inspectorTab = 'story';
	}

	async function transcribeStem() {
		if (!stem || !analysis || !song) return;
		stemBusy = true;
		if (appMode === 'studio') inspectorTab = 'story';

		try {
			const essentia = new EssentiaService();
			await essentia.initialize();
			const result = await runLyricsPipeline(
				{
					song,
					stem,
					analysis,
					videoAssets: videoFiles.map((file, i) => ({ id: String(i), file, name: file.name })),
					duration
				},
				{
					services: pipelineServices(),
					onStage: (id, status, detail) => {
						stageStates = stageStates.map((s) =>
							s.id === id ? { ...s, status, detail: detail ?? s.detail } : s
						);
					},
					presetId: 'balanced-music-video',
					seed
				}
			);
			transcript = result.transcript;
			pipelineChunks = result.chunks || [];
			storyDirections = result.storyDirections || [];
			storyPlan = result.storyPlan;
			if (result.editPlan?.ready) {
				const plan = result.editPlan;
				markerSwapThreshold = plan.triggerSettings.markerThreshold;
				fxIntensity = plan.triggerSettings.intensity;
				fxDecay = Math.max(0.05, plan.triggerSettings.decay);
				jumpCuts = plan.triggerSettings.jumpCuts;
				if (plan.speedRamp?.enabled && analysis?.energy?.curve?.length) {
					speedRampEnabled = true;
					speedMin = plan.speedRamp.min;
					speedMax = plan.speedRamp.max;
					speedSmoothing = plan.speedRamp.smoothing;
				}
				const firstPreset = plan.shaderPresetIds?.[0];
				const owner = firstPreset ? findShaderByPresetId(firstPreset) : null;
				if (owner) selectShader(owner.id, firstPreset);
			}
		} catch (err) {
			console.error('[Story] transcription failed:', err);
		}
		stemBusy = false;
	}

	// === Playback engine ===

	$effect(() => {
		const clock = new Clock({
			getTime: () => audioEl?.currentTime || 0,
			isRunning: () => !!audioEl && !audioEl.paused,
			onTick: handleTick
		});
		clock.start();
		return () => clock.stop();
	});

	// Reset trigger walking whenever the trigger list changes
	$effect(() => {
		scheduler.reset(activeTriggers, audioEl?.currentTime || 0);
		markerCounter = 0;
	});

	async function ensureAnalyzer() {
		if (analyzer || !audioEl) return;
		analyzer = new AudioAnalyzer();
		const ok = await analyzer.initializeAudio(null, audioEl);
		if (!ok) analyzer = null;
	}

	function handleTick(time, dt) {
		currentTime = time;

		// Speed ramp mapping
		let mappedTime = time;
		if (speedRampActive) {
			const { speed, remappedTime } = sampleSpeedCurve(speedCurve, time);
			currentSpeed = speed;
			mappedTime = remappedTime;
			playerRef?.setDirectFrameMapping(true);
		} else {
			currentSpeed = 1;
			playerRef?.setDirectFrameMapping(false);
		}

		// Section pool enforcement
		const section = sectionAtTime(sections, time, duration);
		if (section.index !== currentSectionIndex) {
			currentSectionIndex = section.index;
			const pool = poolForSection(
				section.index,
				sectionVideoPools,
				videoFiles.length,
				sections.length > 0
			);
			if (pool.length > 0 && !pool.includes(currentClipIndex)) {
				swapToClip(pool[0], mappedTime);
			}
			// Prewarm first pool clip of the NEXT section for a hitch-free boundary
			const nextPool = poolForSection(
				section.index + 1,
				sectionVideoPools,
				videoFiles.length,
				sections.length > 0
			);
			if (nextPool.length > 0) videoSourcePool.primeClip(nextPool[0], 0);
		}

		// Beat triggers
		const hits = scheduler.advance(activeTriggers, time, { isPlaying: true });
		for (const _hit of hits) handleTriggerHit(mappedTime);

		// Audio-reactive + trigger-spiked uniforms
		fxBoost *= Math.exp(-Math.max(0, dt) / Math.max(0.02, fxDecay));
		if (analyzer) {
			const levels = analyzer.getAudioData();
			if (uniforms.u_audioLevel)
				uniforms.u_audioLevel.value = Math.min(1.5, levels.audioLevel + fxBoost);
			if (uniforms.u_bassLevel)
				uniforms.u_bassLevel.value = Math.min(1.5, levels.bassLevel + fxBoost * 0.6);
			if (uniforms.u_midLevel) uniforms.u_midLevel.value = levels.midLevel;
			if (uniforms.u_trebleLevel) uniforms.u_trebleLevel.value = levels.trebleLevel;
		} else if (uniforms.u_audioLevel) {
			uniforms.u_audioLevel.value = Math.min(1.5, fxBoost);
		}

		playerRef?.setAudioTime(mappedTime, TARGET_FPS);
	}

	function handleTriggerHit(mappedTime) {
		fxBoost = Math.min(1.5, fxBoost + fxIntensity);
		beatActive = true;
		clearTimeout(beatFlashTimer);
		beatFlashTimer = setTimeout(() => (beatActive = false), 120);

		markerCounter += 1;
		if (jumpCuts) {
			const offset =
				Math.floor(seededRandom(scheduler.nextMarkerIndex + seed) * JUMP_CUT_RANGE * 2) -
				JUMP_CUT_RANGE;
			playerRef?.jumpFrames(offset);
		}

		if (markerCounter >= markerSwapThreshold) {
			markerCounter = 0;
			advanceClip(mappedTime);
		}
	}

	function currentPool() {
		const section = sectionAtTime(sections, currentTime, duration);
		const pool = poolForSection(
			section.index,
			sectionVideoPools,
			videoFiles.length,
			sections.length > 0
		);
		return pool.length > 0 ? pool : videoFiles.map((_, i) => i);
	}

	function advanceClip(mappedTime = null, direction = 1) {
		const pool = currentPool();
		if (pool.length === 0) return;
		const pos = pool.indexOf(currentClipIndex);
		const next = pool[(pos + direction + pool.length) % pool.length];
		swapToClip(next, mappedTime ?? playbackMappedTime());
	}

	function playbackMappedTime() {
		if (speedRampActive) return sampleSpeedCurve(speedCurve, currentTime).remappedTime;
		return currentTime;
	}

	function swapToClip(clipIndex, mappedTime) {
		currentClipIndex = clipIndex;
		playerRef?.seekToClip(clipIndex, mappedTime, speedRampActive);
	}

	function togglePlayback() {
		if (!audioEl?.src) return;
		if (isPlaying) {
			isPlaying = false;
		} else {
			ensureAnalyzer();
			isPlaying = true;
		}
	}

	function restart() {
		if (audioEl) audioEl.currentTime = 0;
		currentTime = 0;
		markerCounter = 0;
		currentSectionIndex = -1;
		scheduler.reset(activeTriggers, 0);
		const pool = poolForSection(0, sectionVideoPools, videoFiles.length, sections.length > 0);
		swapToClip(pool.length > 0 ? pool[0] : 0, 0);
		playerRef?.setAudioTime(0, TARGET_FPS);
	}

	function handleSeek(time) {
		scheduler.reset(activeTriggers, time);
		markerCounter = 0;
		currentTime = time;
		const mapped = speedRampActive ? sampleSpeedCurve(speedCurve, time).remappedTime : time;
		const section = sectionAtTime(sections, time, duration);
		currentSectionIndex = section.index;
		const pool = poolForSection(
			section.index,
			sectionVideoPools,
			videoFiles.length,
			sections.length > 0
		);
		if (pool.length > 0 && !pool.includes(currentClipIndex)) {
			swapToClip(pool[0], mapped);
		} else {
			playerRef?.seekToClip(currentClipIndex, mapped, speedRampActive);
		}
		playerRef?.setAudioTime(mapped, TARGET_FPS);
	}

	function previewClip(clipIndex) {
		swapToClip(clipIndex, playbackMappedTime());
	}

	// === Export ===

	async function startExport() {
		if (!song || videoFiles.length === 0 || !duration) return;
		isPlaying = false;
		exportOpen = true;
		exportProgress = 0;
		exportStatus = 'Starting...';
		exportError = '';
		if (exportUrl) {
			URL.revokeObjectURL(exportUrl);
			exportUrl = '';
		}
		exportAbort = new AbortController();

		try {
			exportStatus = 'Preparing clip decoder for export...';
			if (clipPool.entries.length === 0) {
				await clipPool.loadClips(videoFiles, (progress, status) => {
					exportStatus = status;
				});
			}
			const clipsMeta = videoFiles.map((_, i) => ({
				frameCount: clipPool.getClipInfo(i)?.frameCount || 1
			}));
			const blob = await exportVideo({
				audioFile: song,
				durationSec: duration,
				clips: videoFiles.map((file) => ({ file })),
				edit: {
					triggers: activeTriggers,
					markerSwapThreshold,
					sections,
					sectionVideoPools,
					clips: clipsMeta,
					speedCurve: speedRampActive ? speedCurve : null,
					jumpCuts,
					jumpCutRange: JUMP_CUT_RANGE,
					seed
				},
				fragmentShader: filtersEnabled ? fragmentShader : null,
				uniforms: uniformSnapshot(),
				fps: TARGET_FPS,
				width: 1920,
				height: 1080,
				onProgress: (progress, status) => {
					exportProgress = progress;
					exportStatus = status;
				},
				signal: exportAbort.signal
			});
			exportUrl = URL.createObjectURL(blob);
		} catch (err) {
			if (err?.name === 'AbortError') {
				exportOpen = false;
			} else {
				console.error('[Export] failed:', err);
				exportError = String(err?.message || err);
			}
		}
		exportAbort = null;
	}

	function cancelExport() {
		exportAbort?.abort();
		exportOpen = false;
	}

	// === Reset to landing ===

	async function resetAll() {
		isPlaying = false;
		exportAbort?.abort();
		if (audioEl) {
			audioEl.pause();
			if (audioEl.src) URL.revokeObjectURL(audioEl.src);
			audioEl.removeAttribute('src');
		}
		analyzer?.destroy();
		analyzer = null;
		await videoSourcePool.dispose();
		await clipPool.dispose();
		clearFilmstripCache();
		if (exportUrl) URL.revokeObjectURL(exportUrl);

		song = null;
		stem = null;
		videoFiles = [];
		analysis = null;
		transcript = null;
		storyPlan = null;
		storyDirections = [];
		sectionVideoPools = {};
		stageStates = [];
		duration = 0;
		currentTime = 0;
		markerCounter = 0;
		currentSectionIndex = -1;
		exportUrl = '';
		exportOpen = false;
		activeStep = 'media';
		inspectorTab = 'fx';
		appMode = 'landing';
	}

	const sectionLabel = $derived(sectionAtTime(sections, currentTime, duration).label || 'song');
</script>

<div class="flex h-screen w-full flex-col overflow-hidden bg-zinc-950 text-zinc-100">
	{#if appMode === 'landing'}
		<DropZone onStart={handleStart} />
	{:else}
		<TransportBar
			{isPlaying}
			{currentTime}
			{duration}
			bpm={analysis?.bpm || 0}
			{sectionLabel}
			{beatActive}
			{markerCounter}
			{markerSwapThreshold}
			{currentSpeed}
			speedRampEnabled={speedRampActive}
			exporting={exportOpen && !exportUrl && !exportError}
			onTogglePlayback={togglePlayback}
			onRestart={restart}
			onNextVideo={() => advanceClip(null, 1)}
			onPreviousVideo={() => advanceClip(null, -1)}
			onExport={startExport}
			onReset={resetAll}
		/>

		{#if appMode === 'studio'}
			<div class="border-b border-zinc-800 bg-zinc-950">
				<StudioStepper bind:activeStep completed={stepCompleted} />
			</div>
		{/if}

		<div class="flex min-h-0 flex-1">
			<main class="relative min-w-0 flex-1 bg-black">
				<ShaderPlayer
					bind:this={playerRef}
					pool={videoSourcePool}
					{fragmentShader}
					bind:uniforms
					{filtersEnabled}
				/>

				{#if autopilotRunning || (appMode === 'autopilot' && stageStates.some((s) => s.status === 'running'))}
					<div class="absolute top-4 right-4 z-10 w-72">
						<AutopilotRail stages={stageStates} />
					</div>
				{/if}

				{#if mediaLoading}
					<div
						class="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm"
					>
						<div class="flex flex-col items-center gap-3">
							<div
								class="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-violet-400"
							></div>
							<span class="text-sm text-zinc-400">{loadStatus || 'Loading media...'}</span>
						</div>
					</div>
				{/if}
			</main>

			<Inspector
				bind:activeTab={inspectorTab}
				bind:selectedShaderId
				bind:selectedPresetId
				bind:uniforms
				bind:filtersEnabled
				hasAudio={!!song}
				hasVideo={videoFiles.length > 0}
				bpm={analysis?.bpm || 0}
				energy={analysis?.energy || null}
				onSelectShader={(id) => selectShader(id)}
				onApplyPreset={(shaderId, presetId) => applyPreset(shaderId, presetId)}
				{sections}
				clips={clipList}
				bind:sectionVideoPools
				sectionColorPalette={SECTION_COLORS}
				bind:selectedSectionIndex
				onPreviewClip={previewClip}
				bind:triggerSource
				hasMidi={false}
				hasOnsets={(analysis?.onsets?.length || 0) > 0}
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
				hasEnergyCurve={(analysis?.energy?.curve?.length || 0) > 0}
				{storyPlan}
				{storyDirections}
				bind:selectedDirectionIndex
				{transcript}
				storyBusy={storyBusy}
				{stem}
				stemBusy={stemBusy}
				canTranscribe={!!analysis && !!song}
				onStemSelect={handleStemSelect}
				onTranscribeStem={transcribeStem}
				onRegenerateStory={regenerateStory}
			/>
		</div>

		<div class="shrink-0 border-t border-zinc-800 bg-zinc-950 px-2 py-1.5">
			<PeaksPlayer
				audioFile={song}
				mediaElement={audioEl}
				bind:currentTime
				bind:duration
				bind:isPlaying
				onsets={analysis?.onsets || []}
				{sections}
				lyricChunks={pipelineChunks}
				sectionColorPalette={SECTION_COLORS}
				onSeek={handleSeek}
				onTogglePlayback={togglePlayback}
				onRestart={restart}
				onNextVideo={() => advanceClip(null, 1)}
				zoomHeight={88}
				overviewHeight={36}
			/>
		</div>
	{/if}

	<audio bind:this={audioEl} hidden></audio>

	<ExportDialog
		bind:open={exportOpen}
		progress={exportProgress}
		status={exportStatus}
		error={exportError}
		resultUrl={exportUrl}
		fileName={song
			? song.name.replace(/\.[^.]+$/, '') + '-shaders.mp4'
			: 'video-shaders-export.mp4'}
		onCancel={cancelExport}
		onClose={() => (exportOpen = false)}
	/>
</div>
