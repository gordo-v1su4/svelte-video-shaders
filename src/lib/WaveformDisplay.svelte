<script>
	import { onMount } from 'svelte';

	let {
		audioFile = null,
		beats = [],
		bpm = 0,
		currentTime = 0,
		duration = 0,
		frameRate = 30,
		onSeek = (time) => {},
		onSegmentChange = (segments) => {},
		onMarkerAdd = (marker) => {}
	} = $props();

	// Canvas refs
	let rulerCanvas;
	let waveformCanvas;
	let segmentCanvas;
	let rulerCtx;
	let waveformCtx;
	let segmentCtx;
	
	// Container ref for width
	let container;
	let containerWidth = $state(0);

	// State
	let waveformData = null;
	let isLoading = $state(false);
	let localDuration = $state(0);
	let timeDisplayMode = $state('time'); // 'time', 'frames', 'beats'
	let showBeats = $state(true);
	let snapToBeats = $state(false);
	let zoom = $state(1);
	let scrollOffset = $state(0);

	// Segments (in/out regions)
	let segments = $state([]);
	let isCreatingSegment = $state(false);
	let segmentStart = $state(null);
	let hoveredSegment = $state(null);
	let selectedSegment = $state(null);

	// Markers
	let markers = $state([]);

	// Dragging state
	let isDragging = $state(false);
	let dragType = $state(null); // 'playhead', 'segment-start', 'segment-end', 'scroll'
	let dragTarget = $state(null);

	// Dimensions
	const RULER_HEIGHT = 24;
	const WAVEFORM_HEIGHT = 80;
	const SEGMENT_HEIGHT = 32;
	$effect(() => {
		if (container) {
			const observer = new ResizeObserver(entries => {
				containerWidth = entries[0].contentRect.width;
				initCanvases();
			});
			observer.observe(container);
			return () => observer.disconnect();
		}
	});

	function initCanvases() {
		if (!containerWidth) return;
		
		if (rulerCanvas) {
			rulerCtx = rulerCanvas.getContext('2d');
			rulerCanvas.width = containerWidth;
			rulerCanvas.height = RULER_HEIGHT;
		}
		if (waveformCanvas) {
			waveformCtx = waveformCanvas.getContext('2d');
			waveformCanvas.width = containerWidth;
			waveformCanvas.height = WAVEFORM_HEIGHT;
		}
		if (segmentCanvas) {
			segmentCtx = segmentCanvas.getContext('2d');
			segmentCanvas.width = containerWidth;
			segmentCanvas.height = SEGMENT_HEIGHT;
		}
		
		drawAll();
	}

	onMount(() => {
		initCanvases();
	});

	// Computed values
	const effectiveDuration = $derived(localDuration || duration || 1);
	const visibleDuration = $derived(effectiveDuration / zoom);
	const pixelsPerSecond = $derived(containerWidth / visibleDuration);
	const currentFrame = $derived(Math.floor(currentTime * frameRate));
	const totalFrames = $derived(Math.floor(effectiveDuration * frameRate));
	const currentBeat = $derived(bpm > 0 ? (currentTime / 60) * bpm : 0);

	// Time/position conversion
	function timeToX(time) {
		return ((time - scrollOffset) / visibleDuration) * containerWidth;
	}

	function xToTime(x) {
		return (x / containerWidth) * visibleDuration + scrollOffset;
	}

	function snapTime(time) {
		if (!snapToBeats || beats.length === 0) return time;
		// Find closest beat
		let closest = beats[0];
		let minDist = Math.abs(time - closest);
		for (const beat of beats) {
			const dist = Math.abs(time - beat);
			if (dist < minDist) {
				minDist = dist;
				closest = beat;
			}
		}
		// Snap if within threshold (50ms)
		return minDist < 0.05 ? closest : time;
	}

	// Drawing functions
	function drawAll() {
		drawRuler();
		drawWaveform();
		drawSegments();
	}

	function drawRuler() {
		if (!rulerCtx || !containerWidth) return;
		const ctx = rulerCtx;
		const width = containerWidth;
		const height = RULER_HEIGHT;

		// Background
		ctx.fillStyle = '#0d0d0d';
		ctx.fillRect(0, 0, width, height);

		// Draw ticks based on mode
		ctx.strokeStyle = '#444';
		ctx.fillStyle = '#888';
		ctx.font = '10px monospace';
		ctx.textAlign = 'center';

		if (timeDisplayMode === 'beats' && bpm > 0) {
			// Beat-based ruler
			const beatsPerBar = 4;
			const secondsPerBeat = 60 / bpm;
			const beatSpacing = pixelsPerSecond * secondsPerBeat;
			
			for (let beat = 0; beat * secondsPerBeat < effectiveDuration; beat++) {
				const time = beat * secondsPerBeat;
				const x = timeToX(time);
				if (x < 0 || x > width) continue;
				
				const isBar = beat % beatsPerBar === 0;
				ctx.beginPath();
				ctx.moveTo(x, isBar ? 0 : height / 2);
				ctx.lineTo(x, height);
				ctx.lineWidth = isBar ? 2 : 1;
				ctx.strokeStyle = isBar ? '#666' : '#333';
				ctx.stroke();
				
				if (isBar && beatSpacing > 20) {
					const bar = Math.floor(beat / beatsPerBar) + 1;
					ctx.fillText(`${bar}`, x, 10);
				}
			}
		} else if (timeDisplayMode === 'frames') {
			// Frame-based ruler
			const framesPerTick = Math.ceil(10 / (pixelsPerSecond / frameRate));
			for (let frame = 0; frame < totalFrames; frame += framesPerTick) {
				const time = frame / frameRate;
				const x = timeToX(time);
				if (x < 0 || x > width) continue;
				
				const isMajor = frame % (framesPerTick * 5) === 0;
				ctx.beginPath();
				ctx.moveTo(x, isMajor ? 0 : height / 2);
				ctx.lineTo(x, height);
				ctx.lineWidth = isMajor ? 2 : 1;
				ctx.strokeStyle = isMajor ? '#666' : '#333';
				ctx.stroke();
				
				if (isMajor) {
					ctx.fillText(`${frame}f`, x, 10);
				}
			}
		} else {
			// Time-based ruler
			const tickInterval = getTickInterval(visibleDuration);
			for (let time = 0; time < effectiveDuration; time += tickInterval) {
				const x = timeToX(time);
				if (x < 0 || x > width) continue;
				
				const isMajor = Math.round(time / tickInterval) % 5 === 0;
				ctx.beginPath();
				ctx.moveTo(x, isMajor ? 0 : height / 2);
				ctx.lineTo(x, height);
				ctx.lineWidth = isMajor ? 2 : 1;
				ctx.strokeStyle = isMajor ? '#666' : '#333';
				ctx.stroke();
				
				if (isMajor) {
					ctx.fillText(formatTimeShort(time), x, 10);
				}
			}
		}

		// Playhead indicator on ruler
		const playheadX = timeToX(currentTime);
		if (playheadX >= 0 && playheadX <= width) {
			ctx.fillStyle = '#ffffff';
			ctx.beginPath();
			ctx.moveTo(playheadX - 4, height);
			ctx.lineTo(playheadX + 4, height);
			ctx.lineTo(playheadX, height - 6);
			ctx.closePath();
			ctx.fill();
			
			// Playhead line
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(playheadX, 0);
			ctx.lineTo(playheadX, height);
			ctx.stroke();
		}
	}

	function getTickInterval(duration) {
		if (duration < 5) return 0.1;
		if (duration < 30) return 1;
		if (duration < 120) return 5;
		if (duration < 600) return 30;
		return 60;
	}

	function drawWaveform() {
		if (!waveformCtx || !containerWidth) return;
		const ctx = waveformCtx;
		const width = containerWidth;
		const height = WAVEFORM_HEIGHT;

		// Background - dark with subtle grid
		ctx.fillStyle = '#08080a';
		ctx.fillRect(0, 0, width, height);
		
		// Center line
		ctx.strokeStyle = '#1a1a1e';
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, height / 2);
		ctx.lineTo(width, height / 2);
		ctx.stroke();

		if (!waveformData) {
			ctx.fillStyle = '#3a3a3e';
			ctx.font = '11px -apple-system, sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('Upload audio to see waveform', width / 2, height / 2);
			return;
		}

		// Draw waveform with gradient
		const centerY = height / 2;
		const gradient = ctx.createLinearGradient(0, 0, 0, height);
		gradient.addColorStop(0, '#a882ff');
		gradient.addColorStop(0.3, '#7c5ce0');
		gradient.addColorStop(0.5, '#5a3fc0');
		gradient.addColorStop(0.7, '#7c5ce0');
		gradient.addColorStop(1, '#a882ff');
		ctx.fillStyle = gradient;

		for (let px = 0; px < width; px++) {
			const time = xToTime(px);
			const sampleIndex = Math.floor((time / effectiveDuration) * waveformData.length);
			if (sampleIndex < 0 || sampleIndex >= waveformData.length) continue;
			
			const amplitude = waveformData[sampleIndex] * (height / 2 - 4);
			ctx.fillRect(px, centerY - amplitude, 1, amplitude * 2);
		}

		// Draw beat markers
		if (showBeats && beats.length > 0) {
			for (const beat of beats) {
				const x = timeToX(beat);
				if (x < 0 || x > width) continue;
				
				// Subtle vertical highlight
				ctx.fillStyle = 'rgba(168, 130, 255, 0.08)';
				ctx.fillRect(x - 1, 0, 2, height);
				
				// Beat line
				ctx.strokeStyle = 'rgba(168, 130, 255, 0.4)';
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(x, 0);
				ctx.lineTo(x, height);
				ctx.stroke();
			}
		}

		// Draw markers
		for (const marker of markers) {
			const x = timeToX(marker.time);
			if (x < 0 || x > width) continue;
			
			ctx.strokeStyle = marker.color || '#ffaa00';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, height);
			ctx.stroke();
			
			// Marker label
			ctx.fillStyle = marker.color || '#ffaa00';
			ctx.font = '10px sans-serif';
			ctx.textAlign = 'left';
			ctx.fillText(marker.label || 'M', x + 2, 12);
		}

		// Draw playhead
		const playheadX = timeToX(currentTime);
		if (playheadX >= 0 && playheadX <= width) {
			// Playhead glow
			ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
			ctx.fillRect(playheadX - 4, 0, 8, height);
			
			// Playhead line
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(playheadX, 0);
			ctx.lineTo(playheadX, height);
			ctx.stroke();
		}
	}

	function drawSegments() {
		if (!segmentCtx || !containerWidth) return;
		const ctx = segmentCtx;
		const width = containerWidth;
		const height = SEGMENT_HEIGHT;

		// Background
		ctx.fillStyle = '#0a0a0a';
		ctx.fillRect(0, 0, width, height);

		// Draw segments
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const startX = timeToX(seg.start);
			const endX = timeToX(seg.end);
			const segWidth = endX - startX;
			
			if (endX < 0 || startX > width) continue;
			
			// Segment fill
			const isHovered = hoveredSegment === i;
			const isSelected = selectedSegment === i;
			ctx.fillStyle = isSelected ? 'rgba(168, 130, 255, 0.25)' : 
							 isHovered ? 'rgba(168, 130, 255, 0.18)' : 
							 'rgba(168, 130, 255, 0.12)';
			ctx.fillRect(startX, 4, segWidth, height - 8);
			
			// Segment border
			ctx.strokeStyle = isSelected ? '#a882ff' : '#6a5a8e';
			ctx.lineWidth = isSelected ? 2 : 1;
			ctx.strokeRect(startX, 4, segWidth, height - 8);
			
			// Segment handles
			ctx.fillStyle = isSelected ? '#a882ff' : '#6a5a8e';
			ctx.fillRect(startX - 2, 4, 4, height - 8);
			ctx.fillRect(endX - 2, 4, 4, height - 8);
			
			// Segment label
			if (segWidth > 40) {
				ctx.fillStyle = isSelected ? '#e0e0e4' : '#8a8a8e';
				ctx.font = '9px -apple-system, sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText(seg.label || `Seg ${i + 1}`, startX + segWidth / 2, height / 2 + 3);
			}
		}

		// Draw segment being created
		if (isCreatingSegment && segmentStart !== null) {
			const startX = timeToX(segmentStart);
			ctx.strokeStyle = '#a882ff';
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(startX, 4);
			ctx.lineTo(startX, height - 4);
			ctx.stroke();
			ctx.setLineDash([]);
		}

		// Playhead on segment track
		const playheadX = timeToX(currentTime);
		if (playheadX >= 0 && playheadX <= width) {
			ctx.strokeStyle = '#ffffff';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(playheadX, 0);
			ctx.lineTo(playheadX, height);
			ctx.stroke();
		}
	}

	// Waveform loading
	async function loadWaveform(file) {
		if (!file) return;
		
		isLoading = true;
		
		try {
			const audioContext = new AudioContext();
			// Handle suspended state (browser autoplay policy)
			if (audioContext.state === 'suspended') {
				await audioContext.resume();
			}
			const arrayBuffer = await file.arrayBuffer();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			
			const channelData = audioBuffer.getChannelData(0);
			localDuration = audioBuffer.duration;
			
			// High-resolution waveform data
			const targetSamples = 4000; // Enough for zooming
			// Ensure at least 1 sample per pixel to avoid division by zero
			const samplesPerPixel = Math.max(1, Math.floor(channelData.length / targetSamples));
			waveformData = new Float32Array(targetSamples);
			
			for (let i = 0; i < targetSamples; i++) {
				let sum = 0;
				const start = i * samplesPerPixel;
				// Handle case where audio is shorter than targetSamples
				const actualSamples = Math.min(samplesPerPixel, channelData.length - start);
				for (let j = 0; j < actualSamples; j++) {
					if (start + j < channelData.length) {
						sum += Math.abs(channelData[start + j]);
					}
				}
				// Avoid division by zero - use actual sample count
				waveformData[i] = actualSamples > 0 ? sum / actualSamples : 0;
			}
			
			// Normalize
			const max = Math.max(...waveformData);
			if (max > 0) {
				for (let i = 0; i < targetSamples; i++) {
					waveformData[i] /= max;
				}
			}
			
			audioContext.close();
			drawAll();
		} catch (e) {
			console.error('Failed to load waveform:', e);
		} finally {
			isLoading = false;
		}
	}

	// Event handlers
	function handleWaveformClick(e) {
		if (isDragging) return;
		const rect = waveformCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = snapTime(xToTime(x));
		onSeek(Math.max(0, Math.min(time, effectiveDuration)));
	}

	function handleSegmentMouseDown(e) {
		const rect = segmentCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = xToTime(x);

		// Check if clicking on segment handle
		for (let i = 0; i < segments.length; i++) {
			const seg = segments[i];
			const startX = timeToX(seg.start);
			const endX = timeToX(seg.end);
			
			if (Math.abs(x - startX) < 6) {
				isDragging = true;
				dragType = 'segment-start';
				dragTarget = i;
				return;
			}
			if (Math.abs(x - endX) < 6) {
				isDragging = true;
				dragType = 'segment-end';
				dragTarget = i;
				return;
			}
			if (x >= startX && x <= endX) {
				selectedSegment = i;
				drawSegments();
				return;
			}
		}

		// Start new segment
		if (e.shiftKey) {
			isCreatingSegment = true;
			segmentStart = snapTime(time);
			selectedSegment = null;
		} else {
			selectedSegment = null;
		}
		drawSegments();
	}

	function handleSegmentMouseUp(e) {
		if (isCreatingSegment && segmentStart !== null) {
			const rect = segmentCanvas.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const endTime = snapTime(xToTime(x));
			
			if (Math.abs(endTime - segmentStart) > 0.1) {
				const newSeg = {
					start: Math.min(segmentStart, endTime),
					end: Math.max(segmentStart, endTime),
					label: `Segment ${segments.length + 1}`
				};
				segments = [...segments, newSeg];
				onSegmentChange(segments);
			}
		}
		
		isCreatingSegment = false;
		segmentStart = null;
		isDragging = false;
		dragType = null;
		dragTarget = null;
		drawSegments();
	}

	function handleMouseMove(e) {
		if (!isDragging || dragTarget === null) return;
		
		const rect = segmentCanvas.getBoundingClientRect();
		const x = e.clientX - rect.left;
		const time = snapTime(Math.max(0, Math.min(xToTime(x), effectiveDuration)));
		
		if (dragType === 'segment-start') {
			segments[dragTarget].start = Math.min(time, segments[dragTarget].end - 0.1);
		} else if (dragType === 'segment-end') {
			segments[dragTarget].end = Math.max(time, segments[dragTarget].start + 0.1);
		}
		
		segments = [...segments];
		onSegmentChange(segments);
		drawSegments();
	}

	function handleWheel(e) {
		e.preventDefault();
		
		if (e.ctrlKey) {
			// Zoom
			const delta = e.deltaY > 0 ? 0.9 : 1.1;
			zoom = Math.max(1, Math.min(zoom * delta, 50));
		} else {
			// Scroll
			const scrollAmount = (e.deltaY / containerWidth) * visibleDuration;
			scrollOffset = Math.max(0, Math.min(scrollOffset + scrollAmount, effectiveDuration - visibleDuration));
		}
		
		drawAll();
	}

	// Segment actions
	function deleteSelectedSegment() {
		if (selectedSegment !== null) {
			segments = segments.filter((_, i) => i !== selectedSegment);
			onSegmentChange(segments);
			selectedSegment = null;
			drawSegments();
		}
	}

	function addMarker() {
		const newMarker = {
			time: currentTime,
			label: `M${markers.length + 1}`,
			color: '#ffaa00'
		};
		markers = [...markers, newMarker];
		onMarkerAdd(newMarker);
		drawWaveform();
	}

	function handleKeyDown(e) {
		if (e.key === 'Delete' || e.key === 'Backspace') {
			deleteSelectedSegment();
		} else if (e.key === 'm' || e.key === 'M') {
			addMarker();
		}
	}

	// Formatting
	function formatTimeShort(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function formatTimeFull(seconds) {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const ms = Math.floor((seconds % 1) * 1000);
		return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
	}

	function formatDisplay(time) {
		if (timeDisplayMode === 'frames') {
			return `${Math.floor(time * frameRate)}f`;
		} else if (timeDisplayMode === 'beats' && bpm > 0) {
			const beat = (time / 60) * bpm;
			return `${beat.toFixed(2)} beats`;
		}
		return formatTimeFull(time);
	}

	// Effects
	$effect(() => {
		if (beats || currentTime || segments) {
			drawAll();
		}
	});

	$effect(() => {
		if (audioFile) {
			loadWaveform(audioFile);
		}
	});
</script>

<svelte:window onkeydown={handleKeyDown} />

<div 
	class="timeline-container" 
	bind:this={container}
	onwheel={handleWheel}
	onmousemove={handleMouseMove}
	onmouseup={handleSegmentMouseUp}
	onmouseleave={handleSegmentMouseUp}
	role="application"
	aria-label="Timeline editor"
>
	<!-- Header toolbar -->
	<div class="timeline-header">
		<div class="header-left">
			<span class="title">Timeline</span>
			{#if bpm > 0}
				<span class="bpm-badge">{Math.round(bpm)} BPM</span>
			{/if}
			{#if beats.length > 0}
				<span class="beats-badge">{beats.length} beats</span>
			{/if}
		</div>
		
		<div class="header-center">
			<!-- Time display modes -->
			<div class="display-mode-toggle">
				<button 
					class:active={timeDisplayMode === 'time'}
					onclick={() => timeDisplayMode = 'time'}
				>Time</button>
				<button 
					class:active={timeDisplayMode === 'frames'}
					onclick={() => timeDisplayMode = 'frames'}
				>Frames</button>
				<button 
					class:active={timeDisplayMode === 'beats'}
					onclick={() => timeDisplayMode = 'beats'}
					disabled={bpm <= 0}
				>Beats</button>
			</div>
		</div>
		
		<div class="header-right">
			<label class="toggle-option">
				<input type="checkbox" bind:checked={showBeats} />
				<span>Beats</span>
			</label>
			<label class="toggle-option">
				<input type="checkbox" bind:checked={snapToBeats} />
				<span>Snap</span>
			</label>
			<button class="icon-btn" onclick={addMarker} title="Add marker (M)">
				<span>🚩</span>
			</button>
			<button 
				class="icon-btn" 
				onclick={deleteSelectedSegment} 
				disabled={selectedSegment === null}
				title="Delete segment (Del)"
			>
				<span>🗑</span>
			</button>
		</div>
	</div>

	<!-- Main time display -->
	<div class="time-display">
		<div class="current-time">{formatDisplay(currentTime)}</div>
		<div class="time-separator">/</div>
		<div class="total-time">{formatDisplay(effectiveDuration)}</div>
		{#if timeDisplayMode === 'frames'}
			<div class="frame-info">({currentFrame} / {totalFrames})</div>
		{/if}
	</div>

	<!-- Ruler -->
	<canvas 
		bind:this={rulerCanvas}
		class="ruler-canvas"
	></canvas>

	<!-- Waveform -->
	<canvas 
		bind:this={waveformCanvas}
		class="waveform-canvas"
		class:loading={isLoading}
		onclick={handleWaveformClick}
	></canvas>

	<!-- Segments track -->
	<div class="segments-track">
		<div class="track-label">Segments</div>
		<canvas 
			bind:this={segmentCanvas}
			class="segment-canvas"
			onmousedown={handleSegmentMouseDown}
		></canvas>
	</div>

	<!-- Loading overlay -->
	{#if isLoading}
		<div class="loading-overlay">
			<div class="loading-spinner"></div>
			<span>Loading waveform...</span>
		</div>
	{/if}

	<!-- Zoom indicator -->
	<div class="zoom-info">
		<span>Zoom: {zoom.toFixed(1)}x</span>
		<span class="hint">Ctrl+Scroll to zoom</span>
	</div>

	<!-- Instructions -->
	<div class="instructions">
		<span>Click to seek</span>
		<span>Shift+drag to create segment</span>
		<span>M to add marker</span>
	</div>
</div>

<style>
	.timeline-container {
		background: #0d0d0f;
		border-radius: 6px;
		padding: 0;
		position: relative;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
		color: #8a8a8e;
		user-select: none;
		border: 1px solid #1a1a1e;
	}

	/* Header toolbar */
	.timeline-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: #111114;
		border-bottom: 1px solid #1a1a1e;
		border-radius: 6px 6px 0 0;
	}

	.header-left, .header-center, .header-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.title {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #6a6a6e;
	}

	.bpm-badge {
		background: rgba(168, 130, 255, 0.15);
		color: #a882ff;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 10px;
		font-weight: 600;
	}

	.beats-badge {
		background: rgba(255, 100, 100, 0.15);
		color: #ff6464;
		padding: 2px 8px;
		border-radius: 10px;
		font-size: 10px;
	}

	/* Display mode toggle */
	.display-mode-toggle {
		display: flex;
		background: #0a0a0c;
		border-radius: 4px;
		padding: 2px;
		gap: 2px;
	}

	.display-mode-toggle button {
		background: transparent;
		border: none;
		color: #5a5a5e;
		padding: 4px 10px;
		font-size: 10px;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.display-mode-toggle button:hover:not(:disabled) {
		color: #8a8a8e;
	}

	.display-mode-toggle button.active {
		background: #a882ff;
		color: #0d0d0f;
	}

	.display-mode-toggle button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Toggle options */
	.toggle-option {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10px;
		cursor: pointer;
	}

	.toggle-option input {
		width: 12px;
		height: 12px;
		accent-color: #a882ff;
	}

	.icon-btn {
		background: transparent;
		border: 1px solid #2a2a2e;
		color: #6a6a6e;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		transition: all 0.15s;
	}

	.icon-btn:hover:not(:disabled) {
		background: #1a1a1e;
		border-color: #3a3a3e;
		color: #a882ff;
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* Time display */
	.time-display {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
		padding: 10px;
		background: #08080a;
		border-bottom: 1px solid #1a1a1e;
	}

	.current-time {
		font-size: 20px;
		font-weight: 500;
		font-family: 'SF Mono', 'Consolas', monospace;
		color: #e0e0e4;
		letter-spacing: -0.5px;
	}

	.time-separator {
		color: #3a3a3e;
		font-size: 14px;
	}

	.total-time {
		font-size: 12px;
		font-family: 'SF Mono', 'Consolas', monospace;
		color: #5a5a5e;
	}

	.frame-info {
		font-size: 10px;
		color: #4a4a4e;
		margin-left: 8px;
	}

	/* Canvases */
	.ruler-canvas {
		display: block;
		width: 100%;
		height: 24px;
		background: #0d0d0f;
		border-bottom: 1px solid #1a1a1e;
	}

	.waveform-canvas {
		display: block;
		width: 100%;
		height: 80px;
		background: #08080a;
		cursor: crosshair;
	}

	.waveform-canvas.loading {
		opacity: 0.4;
	}

	/* Segments track */
	.segments-track {
		display: flex;
		align-items: stretch;
		background: #0a0a0c;
		border-top: 1px solid #1a1a1e;
	}

	.track-label {
		width: 60px;
		min-width: 60px;
		padding: 8px;
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #4a4a4e;
		background: #0d0d0f;
		border-right: 1px solid #1a1a1e;
		display: flex;
		align-items: center;
	}

	.segment-canvas {
		display: block;
		flex: 1;
		height: 32px;
		background: #08080a;
		cursor: pointer;
	}

	/* Loading overlay */
	.loading-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: #6a6a6e;
		font-size: 11px;
	}

	.loading-spinner {
		width: 20px;
		height: 20px;
		border: 2px solid #2a2a2e;
		border-top-color: #a882ff;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	/* Footer info */
	.zoom-info {
		display: flex;
		justify-content: space-between;
		padding: 6px 12px;
		background: #0d0d0f;
		border-top: 1px solid #1a1a1e;
		font-size: 9px;
		color: #4a4a4e;
	}

	.zoom-info .hint {
		color: #3a3a3e;
	}

	.instructions {
		display: flex;
		justify-content: center;
		gap: 16px;
		padding: 6px 12px;
		background: #08080a;
		border-top: 1px solid #1a1a1e;
		border-radius: 0 0 6px 6px;
		font-size: 9px;
		color: #3a3a3e;
	}

	.instructions span::before {
		content: '•';
		margin-right: 6px;
		color: #2a2a2e;
	}
</style>
