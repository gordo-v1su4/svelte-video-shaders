<script>
	import { onMount, onDestroy, tick } from 'svelte';
	import Peaks from 'peaks.js';

	let {
		audioFile = null,
		zoomHeight = 150,
		overviewHeight = 80,
		waveColor = '#5a3fc0',
		playedWaveColor = '#a882ff',
		cursorColor = '#ffffff',
		segments = [], // { startTime, endTime, color, labelText, id }
		points = [],
		onsets = [], // Array of timestamps for Essentia onsets
		midiMarkers = [], // Array of timestamps for MIDI markers
		showOnsets = $bindable(true), // Toggle for showing Essentia onsets
		showMIDIMarkers = $bindable(true), // Toggle for showing MIDI markers
		currentTime = $bindable(0),
		duration = $bindable(0),
		isPlaying = $bindable(false),
		onSeek = (time) => {},
		onSegmentStart = (segment) => {},
		onSegmentEnd = (segment) => {},
		onSegmentClick = (segment) => {},
		mediaElement = null, // External audio element
		grid = [] // 1/32 note grid markers
	} = $props();

	let zoomviewContainer;
	let overviewContainer;
	// audioRef is now just a local reference to mediaElement for convenience, or we use mediaElement directly
	let peaksInstance;
	let isReady = $state(false);
	
	const id = Math.random().toString(36).substr(2, 9);
	const zoomId = `peaks-zoom-${id}`;
	const overviewId = `peaks-overview-${id}`;

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
		return () => {
			if (peaksInstance) {
				peaksInstance.destroy();
			}
		};
	});

	$effect(() => {
		// Wait for both audioFile AND mediaElement to be present/loaded
		if (audioFile && mounted && mediaElement) {
			// Small delay to ensure DOM paint and element readiness
			setTimeout(() => initPeaks(), 100);
		}
	});

	// Sync playback state
	$effect(() => {
		if (!peaksInstance || !mediaElement) return;
		if (isPlaying && mediaElement.paused) {
			mediaElement.play();
		} else if (!isPlaying && !mediaElement.paused) {
			mediaElement.pause();
		}
	});
	
	// Sync external time
	$effect(() => {
		if (mediaElement && Math.abs(mediaElement.currentTime - currentTime) > 0.1 && !mediaElement.seeking) {
			mediaElement.currentTime = currentTime;
		}
	});

	async function initPeaks() {
		if (peaksInstance) {
			peaksInstance.destroy();
			peaksInstance = null;
		}

		// Ensure we have the raw DOM elements
		const zoomEl = zoomviewContainer || document.getElementById(zoomId);
		const overviewEl = overviewContainer || document.getElementById(overviewId);
		const audioEl = mediaElement;

		console.log("PeaksPlayer Check:", { 
			zoomEl, 
			overviewEl, 
			audioEl,
			isZoomEl: zoomEl instanceof HTMLElement,
			isOverviewEl: overviewEl instanceof HTMLElement
		});

		if (!zoomEl || !overviewEl || !audioEl) {
			console.error("PeaksPlayer: Elements missing after retry", { zoomEl, overviewEl, audioEl });
			return;
		}

		const options = {
			zoomview: {
				container: zoomEl
			},
			overview: {
				container: overviewEl
			},
			mediaElement: audioEl,
			webAudio: {
				audioContext: new AudioContext(),
				scale: 128,
				multiChannel: false
			},
			keyboard: true,
			showPlayheadTime: true,
			emitCueEvents: true,
			zoomWaveformColor: waveColor,
			overviewWaveformColor: waveColor,
			playedWaveformColor: playedWaveColor,
			overviewHighlightRectangleColor: 'rgba(168, 130, 255, 0.4)',
			segments: segments, // User segments
			points: [], // We manage points manually
			segmentOptions: {
				markers: true,
				overlay: true,
				waveformColor: waveColor,
				overlayColor: 'rgba(168, 130, 255, 0.3)', // Semi-transparent purple
				overlayOpacity: 0.3,
				overlayBorderColor: 'rgba(168, 130, 255, 1.0)',
				overlayBorderWidth: 2,
				overlayCornerRadius: 4,
				overlayOffset: 0, // Full height
				overlayLabelAlign: 'left',
				overlayLabelVerticalAlign: 'top',
				overlayLabelPadding: 8,
				overlayLabelColor: '#ffffff',
				overlayFontFamily: 'sans-serif',
				overlayFontSize: 12,
				overlayFontStyle: 'normal'
			}
		};

		// audioEl src should already be set by parent or we ensure it here?
		// Parent manages audio src now.
		
		console.log("PeaksPlayer: Calling Peaks.init");
		Peaks.init(options, (err, peaks) => {
			if (err) {
				console.error('Failed to initialize Peaks.js:', err);
				return;
			}
			
			console.log("PeaksPlayer: Success!");
			peaksInstance = peaks;
			isReady = true;
			
			peaks.on('player.timeupdate', (time) => {
				currentTime = time;
				duration = peaks.player.getDuration();
			});
			
			peaks.on('player.playing', () => { isPlaying = true; });
			peaks.on('player.pause', () => { isPlaying = false; });
			peaks.on('player.ended', () => { isPlaying = false; });
			
			peaks.on('player.seek', (time) => {
				onSeek(time);
			});

			peaks.on('segments.click', (segment) => {
                onSegmentClick(segment);
            });

			// Initial render of markers (onsets + grid)
			renderMarkers();
		});
	}

	$effect(() => {
		// Re-render markers when peaks is ready and data (onsets/midiMarkers/grid) or toggle states change
		if (peaksInstance) {
			// Access reactive values to track changes - this ensures the effect runs when any of these change
			const currentOnsets = onsets; // Track onsets changes (including density updates)
			const currentMIDI = midiMarkers; // Track MIDI markers changes
			const currentGrid = grid; // Track grid changes
			const currentShowOnsets = showOnsets; // Track toggle state - MUST access to track changes
			const currentShowMIDI = showMIDIMarkers; // Track toggle state - MUST access to track changes
			
			// Always render markers when peaks is ready, even if arrays are empty (to clear them)
			console.log(`[PeaksPlayer] $effect triggered: onsets.length=${currentOnsets?.length || 0}, midiMarkers.length=${currentMIDI?.length || 0}, grid.length=${currentGrid?.length || 0}, showOnsets=${currentShowOnsets}, showMIDI=${currentShowMIDI}`);
			
			// Use tick to ensure DOM updates are complete before rendering
			tick().then(() => {
				renderMarkers();
			});
		}
	});

	function renderMarkers() {
		if (!peaksInstance) {
			console.log(`[PeaksPlayer] renderMarkers: peaksInstance not ready`);
			return;
		}
		
		// Always clear all points first
		try {
			const existingPoints = peaksInstance.points.getPoints();
			console.log(`[PeaksPlayer] Clearing ${existingPoints.length} existing points`);
			peaksInstance.points.removeAll();
		} catch (e) {
			console.warn(`[PeaksPlayer] Error removing points:`, e);
		}
        
        const allPoints = [];
        
        console.log(`[PeaksPlayer] renderMarkers: showOnsets=${showOnsets}, showMIDI=${showMIDIMarkers}, onsets.length=${onsets?.length || 0}, midiMarkers.length=${midiMarkers?.length || 0}`);

        // 1. Grid Lines (Faint)
        if (grid && grid.length > 0) {
            grid.forEach((time) => {
                allPoints.push({
                    time,
                    labelText: '',
                    editable: false,
                    color: 'rgba(255, 255, 255, 0.1)', // Very faint white
                    shape: 'line'
                });
            });
        }

        // 2. Essentia Onsets (Orange) - only if enabled
		if (showOnsets && onsets && onsets.length > 0) {
             console.log(`[PeaksPlayer] ✅ Adding ${onsets.length} Essentia onsets (showOnsets=${showOnsets})`);
             onsets.forEach((time, i) => {
                const pointTime = typeof time === 'number' ? time : parseFloat(time);
                if (isNaN(pointTime) || pointTime < 0) {
                    console.warn(`[PeaksPlayer] Invalid onset time at index ${i}: ${time}`);
                    return;
                }
                allPoints.push({
                    time: pointTime,
                    labelText: `T${i}`,
                    editable: false,
                    color: '#ff8800', // Orange for Essentia onsets
                    shape: 'line'
                });
            });
		} else {
			console.log(`[PeaksPlayer] ❌ Skipping Essentia onsets: showOnsets=${showOnsets}, onsets.length=${onsets?.length || 0}`);
		}

        // 3. MIDI Markers (Blue) - only if enabled
		if (showMIDIMarkers && midiMarkers && midiMarkers.length > 0) {
             console.log(`[PeaksPlayer] ✅ Adding ${midiMarkers.length} MIDI markers (showMIDIMarkers=${showMIDIMarkers})`);
             midiMarkers.forEach((time, i) => {
                const pointTime = typeof time === 'number' ? time : parseFloat(time);
                if (isNaN(pointTime) || pointTime < 0) {
                    console.warn(`[PeaksPlayer] Invalid MIDI time at index ${i}: ${time}`);
                    return;
                }
                allPoints.push({
                    time: pointTime,
                    labelText: `M${i}`,
                    editable: false,
                    color: '#64c8ff', // Blue for MIDI markers
                    shape: 'line'
                });
            });
		} else {
			console.log(`[PeaksPlayer] ❌ Skipping MIDI markers: showMIDIMarkers=${showMIDIMarkers}, midiMarkers.length=${midiMarkers?.length || 0}`);
		}

		// Always add points, even if empty (to clear the display)
		if (allPoints.length > 0) {
            // Use setTimeout to ensure removeAll() has processed
            setTimeout(() => {
                try {
                    // Peaks.js points.add() accepts an array
                    peaksInstance.points.add(allPoints);
                    const addedPoints = peaksInstance.points.getPoints();
                    console.log(`[PeaksPlayer] ✅ Added ${allPoints.length} points, Peaks.js now has ${addedPoints.length} total points`);
                } catch (e) {
                    console.error(`[PeaksPlayer] ❌ Error adding points:`, e);
                    // Fallback: add individually
                    console.log(`[PeaksPlayer] Trying individual add...`);
                    let successCount = 0;
                    allPoints.forEach((point) => {
                        try {
                            peaksInstance.points.add(point);
                            successCount++;
                        } catch (err) {
                            console.error(`[PeaksPlayer] Failed to add point at ${point.time}:`, err);
                        }
                    });
                    console.log(`[PeaksPlayer] ✅ Added ${successCount}/${allPoints.length} points individually`);
                }
            }, 10); // Small delay to ensure removeAll() completes
        } else {
			console.log(`[PeaksPlayer] ⚠️ No points to add (all toggles off or no data)`);
		}
	}
    
    function snapToGrid(time) {
        if (!grid || grid.length === 0) return time;
        // Find closest grid point
        const closest = grid.reduce((prev, curr) => {
            return (Math.abs(curr - time) < Math.abs(prev - time) ? curr : prev);
        });
        return closest;
    }

	export function addSegment(startTime, endTime, labelText) {
		if (peaksInstance) {
            const current = peaksInstance.player.getCurrentTime();
            // Snap the start time if not explicit
            const start = startTime ?? snapToGrid(current);
            const end = endTime ?? snapToGrid(current + 5); // Default 5s segment
            
			peaksInstance.segments.add({
				startTime: start,
				endTime: end,
				labelText: labelText ?? "New Segment",
				editable: true,
                color: 'rgba(168, 130, 255, 0.4)'
			});
		}
	}

	export function addPoint(time, labelText) {
		if (peaksInstance) {
            const current = peaksInstance.player.getCurrentTime();
            const pointTime = time ?? snapToGrid(current);
            
			peaksInstance.points.add({
				time: pointTime,
				labelText: labelText ?? "Point",
				editable: true,
				color: '#00ccff'
			});
		}
	}

    export function logData() {
        if (!peaksInstance) return;
        const segments = peaksInstance.segments.getSegments();
        const points = peaksInstance.points.getPoints();
        console.log("Current Segments:", segments);
        console.log("Current Points:", points);
    }

    export function zoomIn() { peaksInstance?.zoom.zoomIn(); }
    export function zoomOut() { peaksInstance?.zoom.zoomOut(); }
</script>

<div class="peaks-container" class:loading={!isReady && audioFile}>
	<!-- Removed Hidden native audio element for Peaks to control - Parent provides it -->

	<div class="controls-header">
		<span class="label">Zoom View</span>
        <div class="header-controls">
         {#if isReady}
         <div class="zoom-controls"> 
             <button onclick={zoomIn} title="Zoom in">+</button>
             <button onclick={zoomOut} title="Zoom out">-</button>
         </div>
         {/if}
         <button 
         	class="marker-toggle-btn" 
         	class:active={showMIDIMarkers && midiMarkers && midiMarkers.length > 0}
         	class:disabled={!midiMarkers || midiMarkers.length === 0}
         	onclick={() => { if (midiMarkers && midiMarkers.length > 0) showMIDIMarkers = !showMIDIMarkers; }}
         	title={midiMarkers && midiMarkers.length > 0 ? `Toggle MIDI Markers (${midiMarkers.length})` : 'No MIDI markers'}
         	style="border-color: {showMIDIMarkers && midiMarkers && midiMarkers.length > 0 ? '#64c8ff' : '#444'}; background: {showMIDIMarkers && midiMarkers && midiMarkers.length > 0 ? '#64c8ff' : 'inherit'};"
         >
         	MIDI {midiMarkers && midiMarkers.length > 0 ? `(${midiMarkers.length})` : ''}
         </button>
         <button 
         	class="marker-toggle-btn" 
         	class:active={showOnsets && onsets && onsets.length > 0}
         	class:disabled={!onsets || onsets.length === 0}
         	onclick={() => { if (onsets && onsets.length > 0) showOnsets = !showOnsets; }}
         	title={onsets && onsets.length > 0 ? `Toggle Essentia Onsets (${onsets.length})` : 'No onsets'}
         	style="border-color: {showOnsets && onsets && onsets.length > 0 ? '#ff8800' : '#444'}; background: {showOnsets && onsets && onsets.length > 0 ? '#ff8800' : 'inherit'};"
         >
         	Onsets {onsets && onsets.length > 0 ? `(${onsets.length})` : ''}
         </button>
        </div>
	</div>
	<div bind:this={zoomviewContainer} id={zoomId} class="peaks-zoomview" style:height="{zoomHeight}px"></div>

	<div class="controls-header">
		<span class="label">Overview</span>
	</div>
	<div bind:this={overviewContainer} id={overviewId} class="peaks-overview" style:height="{overviewHeight}px"></div>

	{#if !audioFile}
		<div class="placeholder-overlay">
			<div class="placeholder-content">
				Load Audio to Initialize Waveforms
			</div>
		</div>
	{/if}
</div>

{#if isReady}
<div class="controls-toolbar">
    <button onclick={() => zoomIn()}>Zoom In</button>
    <button onclick={() => zoomOut()}>Zoom Out</button>
    <div class="separator"></div>
    <button onclick={() => addSegment()}>+ Segment</button>
    <button onclick={() => addPoint()}>+ Point</button>
    <div class="separator"></div>
    <button onclick={() => logData()}>Log Data</button>
</div>
{/if}

<style>
	.peaks-container {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		background: #0d0d0d;
		padding: 10px;
		border-radius: 6px;
		border: 1px solid #333;
		position: relative;
	}

	.peaks-zoomview, .peaks-overview {
		background: #1a1a1a;
		width: 100%;
		border-radius: 4px;
        position: relative;
	}

	.controls-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		color: #666;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 1px;
	}

    .header-controls {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .zoom-controls {
        display: flex;
        gap: 4px;
    }

    .zoom-controls button {
        background: #333;
        border: none;
        color: #fff;
        width: 20px;
        height: 20px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .zoom-controls button:hover {
        background: #444;
    }

    .marker-toggle-btn {
        padding: 4px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        transition: all 0.2s;
        border: 1px solid;
        background: #2a2a2a; /* Charcoal grey default */
        color: #999;
    }

    .marker-toggle-btn.disabled {
        background: #1a1a1a !important; /* Darker charcoal when disabled */
        color: #666 !important;
        border-color: #333 !important;
        cursor: not-allowed;
        opacity: 0.6;
    }

    .marker-toggle-btn:not(.active):not(.disabled) {
        background: #2a2a2a; /* Charcoal grey when not active but enabled */
        color: #999;
        border-color: #444;
    }

    .marker-toggle-btn.active {
        opacity: 1;
        color: #fff;
        font-weight: 600;
    }

    .marker-toggle-btn:not(.disabled):hover {
        opacity: 0.9;
        background: #333;
    }

	.placeholder-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(13, 13, 13, 0.8);
		z-index: 10;
		backdrop-filter: blur(2px);
	}

	.placeholder-content {
		color: #888;
		font-family: sans-serif;
	}

    .controls-toolbar {
        display: flex;
        gap: 10px;
        margin-top: 10px;
        padding: 10px;
        background: #1a1a1a;
        border-radius: 6px;
        align-items: center;
    }

    .controls-toolbar button {
        background: #333;
        color: white;
        border: 1px solid #444;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.85rem;
        transition: background 0.2s;
    }

    .controls-toolbar button:hover {
        background: #444;
    }

    .separator {
        width: 1px;
        height: 20px;
        background: #444;
        margin: 0 5px;
    }
</style>
