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
		sections = [], // Song structure sections (intro, verse, chorus, etc.)
		currentTime = $bindable(0),
		duration = $bindable(0),
		isPlaying = $bindable(false),
		onSeek = (time) => {},
		onSegmentStart = (segment) => {},
		onSegmentEnd = (segment) => {},
		onSegmentClick = (segment) => {},
		onPreviewTime = (time) => {},
		mediaElement = null, // External audio element
		grid = [] // 1/32 note grid markers
	} = $props();

	let zoomviewContainer;
	let overviewContainer;
	// audioRef is now just a local reference to mediaElement for convenience, or we use mediaElement directly
	let peaksInstance;
	let isReady = $state(false);
	let previewTime = $state(null);
	let previewX = $state(0);
	let previewLabelX = $state(0);
	let previewTarget = $state(null);
	
	const id = Math.random().toString(36).substr(2, 9);
	const zoomId = `peaks-zoom-${id}`;
	const overviewId = `peaks-overview-${id}`;

	// Format time as mm:ss.ms
	function formatTime(seconds) {
		if (!seconds || isNaN(seconds)) return '00:00.00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const ms = Math.floor((seconds % 1) * 100);
		return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
	}

	function updatePreview(event, viewName, containerEl) {
		if (!peaksInstance || !containerEl) return;
		const rect = containerEl.getBoundingClientRect();
		if (!rect.width) return;
		const localX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
		const view = peaksInstance.views.getView(viewName);
		const viewStart = typeof view?.getStartTime === 'function' ? view.getStartTime() : 0;
		const viewEndFallback = peaksInstance.player?.getDuration?.() || duration || 0;
		const viewEnd = typeof view?.getEndTime === 'function' ? view.getEndTime() : viewEndFallback;
		if (!viewEnd || viewEnd <= viewStart) return;

		const time = viewStart + (localX / rect.width) * (viewEnd - viewStart);
		const labelInset = 32;
		const labelX = Math.min(Math.max(localX, labelInset), rect.width - labelInset);
		previewTime = time;
		previewX = localX;
		previewLabelX = labelX;
		previewTarget = viewName;
		onPreviewTime(time);
	}

	function clearPreview() {
		previewTime = null;
		previewTarget = null;
		onPreviewTime(null);
	}

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
		
		// Add resize handler for waveform
		const handleResize = () => {
			if (peaksInstance) {
				try {
					const zoomview = peaksInstance.views.getView('zoomview');
					const overview = peaksInstance.views.getView('overview');
					if (zoomview) zoomview.fitToContainer();
					if (overview) overview.fitToContainer();
				} catch (e) {
					console.warn('[PeaksPlayer] Resize error:', e);
				}
			}
		};
		
		window.addEventListener('resize', handleResize);
		
		return () => {
			window.removeEventListener('resize', handleResize);
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

			// Initial render of markers - the $effect will handle subsequent updates
			renderMarkersSync(showOnsets, showMIDIMarkers, onsets, midiMarkers, grid);
			
			// Render section overlays if available
			renderSections(sections);
		});
	}

	// Track render version to prevent stale updates
	let renderVersion = $state(0);
	
	// Track array changes by creating a fingerprint that includes first, last, and length
	const onsetsFingerprint = $derived(() => {
		if (!onsets || onsets.length === 0) return 'empty';
		const first = onsets[0]?.toFixed(3) || '0';
		const last = onsets[onsets.length - 1]?.toFixed(3) || '0';
		return `${first}-${last}-${onsets.length}`;
	});
	const midiFingerprint = $derived(() => {
		if (!midiMarkers || midiMarkers.length === 0) return 'empty';
		const first = midiMarkers[0]?.toFixed(3) || '0';
		const last = midiMarkers[midiMarkers.length - 1]?.toFixed(3) || '0';
		return `${first}-${last}-${midiMarkers.length}`;
	});
	const gridFingerprint = $derived(() => grid ? grid.length.toString() : '0');
	const sectionsFingerprint = $derived(() => {
		if (!sections || sections.length === 0) return 'empty';
		return `${sections.length}-${sections.map(s => s.label).join('-')}`;
	});
	
	$effect(() => {
		// Re-render markers when peaks is ready and data or toggle states change
		if (peaksInstance) {
			// Access fingerprints and toggle states to track all changes
			const _onsetsFp = onsetsFingerprint;
			const _midiFp = midiFingerprint;
			const _gridFp = gridFingerprint;
			const _sectionsFp = sectionsFingerprint;
			const _showOnsets = showOnsets;
			const _showMIDI = showMIDIMarkers;
			
			// Capture current array values to avoid stale closures
			const currentOnsets = onsets ? [...onsets] : [];
			const currentMidi = midiMarkers ? [...midiMarkers] : [];
			const currentGrid = grid ? [...grid] : [];
			
			console.log(`[PeaksPlayer] $effect triggered: onsetsFp=${_onsetsFp}, midiFp=${_midiFp}, showOnsets=${_showOnsets}, showMIDI=${_showMIDI}`);
			
			// Increment version and render synchronously
			renderVersion++;
			
			// Render with captured values to avoid stale closure issues
			renderMarkersSync(_showOnsets, _showMIDI, currentOnsets, currentMidi, currentGrid);
			
			// Re-render sections when they change
			if (_sectionsFp !== 'empty') {
				renderSections(sections);
			}
		}
	});

	function renderMarkersSync(shouldShowOnsets, shouldShowMIDI, onsetData, midiData, gridData) {
		if (!peaksInstance) {
			console.log(`[PeaksPlayer] renderMarkers: peaksInstance not ready`);
			return;
		}
		
		// Clear all existing points - be aggressive about it
		try {
			const existingPoints = peaksInstance.points.getPoints();
			console.log(`[PeaksPlayer] Clearing ${existingPoints.length} existing points`);
			
			// Remove points one by one for reliability
			if (existingPoints.length > 0) {
				for (let i = existingPoints.length - 1; i >= 0; i--) {
					try {
						peaksInstance.points.removeById(existingPoints[i].id);
					} catch (e) {
						// Ignore individual removal errors
					}
				}
			}
			
			// Also try removeAll as backup
			peaksInstance.points.removeAll();
			
			// Verify points are cleared
			const remainingPoints = peaksInstance.points.getPoints();
			if (remainingPoints.length > 0) {
				console.warn(`[PeaksPlayer] ⚠️ ${remainingPoints.length} points remain after clear attempt`);
			}
		} catch (e) {
			console.warn(`[PeaksPlayer] Error removing points:`, e);
		}
        
        const allPoints = [];

        // 1. Grid Lines (Very faint)
        if (gridData && gridData.length > 0) {
            gridData.forEach((time) => {
                allPoints.push({
                    time,
                    labelText: '',
                    editable: false,
                    color: 'rgba(255, 255, 255, 0.05)',
                });
            });
        }

        // 2. Essentia Onsets (Orange) - reduced opacity
		if (shouldShowOnsets && onsetData && onsetData.length > 0) {
			console.log(`[PeaksPlayer] ✅ Adding ${onsetData.length} Essentia onsets`);
			onsetData.forEach((time, i) => {
				const pointTime = typeof time === 'number' ? time : parseFloat(time);
				if (!isNaN(pointTime) && pointTime >= 0) {
					allPoints.push({
						time: pointTime,
						labelText: '',
						editable: false,
						color: 'rgba(255, 136, 0, 0.25)',  // 25% opacity orange
					});
				}
			});
		} else {
			console.log(`[PeaksPlayer] ❌ Skipping onsets: show=${shouldShowOnsets}, count=${onsetData?.length || 0}`);
		}

        // 3. MIDI Markers (Blue) - reduced opacity
		if (shouldShowMIDI && midiData && midiData.length > 0) {
			console.log(`[PeaksPlayer] ✅ Adding ${midiData.length} MIDI markers`);
			midiData.forEach((time, i) => {
				const pointTime = typeof time === 'number' ? time : parseFloat(time);
				if (!isNaN(pointTime) && pointTime >= 0) {
					allPoints.push({
						time: pointTime,
						labelText: '',
						editable: false,
						color: 'rgba(100, 200, 255, 0.3)',  // 30% opacity blue
					});
				}
			});
		} else {
			console.log(`[PeaksPlayer] ❌ Skipping MIDI: show=${shouldShowMIDI}, count=${midiData?.length || 0}`);
		}

		// Add all points at once
		if (allPoints.length > 0) {
			try {
				peaksInstance.points.add(allPoints);
				console.log(`[PeaksPlayer] ✅ Added ${allPoints.length} points total`);
			} catch (e) {
				console.error(`[PeaksPlayer] ❌ Error adding points:`, e);
			}
		} else {
			console.log(`[PeaksPlayer] ⚠️ No points to add (toggles: onsets=${shouldShowOnsets}, midi=${shouldShowMIDI})`);
		}
		
		// Force redraw of views and hide points in overview
		try {
			const zoomview = peaksInstance.views.getView('zoomview');
			const overview = peaksInstance.views.getView('overview');
			
			// Use multiple methods to force a redraw
			if (zoomview) {
				// Method 1: Update waveform color (triggers redraw)
				zoomview.setWaveformColor('#5a3fc0');
				// Method 2: Try fitToContainer if available
				if (typeof zoomview.fitToContainer === 'function') {
					zoomview.fitToContainer();
				}
				// Show points in zoom view
				if (typeof zoomview.showPoints === 'function') {
					zoomview.showPoints(true);
				}
			}
			if (overview) {
				overview.setWaveformColor('#5a3fc0');
				if (typeof overview.fitToContainer === 'function') {
					overview.fitToContainer();
				}
				// Hide points in overview - keep only segments
				if (typeof overview.showPoints === 'function') {
					overview.showPoints(false);
				}
			}
			
			// Reduce opacity of point markers in overview via DOM manipulation
			setTimeout(() => {
				const overviewEl = document.querySelector(`#${overviewId}`);
				if (overviewEl) {
					const overviewSvg = overviewEl.querySelector('svg');
					if (overviewSvg) {
						// Get all lines in overview (point markers)
						const allLines = overviewSvg.querySelectorAll('line');
						console.log(`[PeaksPlayer] Setting opacity for ${allLines.length} lines in overview`);
						allLines.forEach(line => {
							line.style.opacity = '0.02';
							line.style.strokeOpacity = '0.02';
						});
					}
				}
			}, 300);
			
			console.log(`[PeaksPlayer] Forced redraw of views`);
		} catch (e) {
			console.warn(`[PeaksPlayer] Error forcing redraw:`, e);
		}
	}
	
	function renderSections(sectionsData) {
		if (!peaksInstance || !sectionsData || sectionsData.length === 0) {
			return;
		}
		
		// Remove existing section segments (they have a special prefix)
		try {
			const existingSegments = peaksInstance.segments.getSegments();
			const sectionSegments = existingSegments.filter(seg => seg.id?.startsWith('section-'));
			
			for (const seg of sectionSegments) {
				peaksInstance.segments.removeById(seg.id);
			}
		} catch (e) {
			console.warn('[PeaksPlayer] Error removing section segments:', e);
		}
		
		// Add section segments - increased opacity for more prominent overlays
		const sectionColors = {
			'intro': 'rgba(255, 200, 100, 0.35)',
			'verse': 'rgba(100, 150, 255, 0.35)',
			'chorus': 'rgba(255, 100, 150, 0.4)',
			'bridge': 'rgba(150, 255, 100, 0.35)',
			'outro': 'rgba(200, 100, 255, 0.35)',
			'default': 'rgba(200, 200, 200, 0.25)'
		};
		
		try {
			sectionsData.forEach((section, index) => {
				const label = section.label?.toLowerCase() || '';
				let color = sectionColors.default;
				
				// Find matching color
				for (const [key, sectionColor] of Object.entries(sectionColors)) {
					if (label.includes(key)) {
						color = sectionColor;
						break;
					}
				}
				
				peaksInstance.segments.add({
					id: `section-${index}`,
					startTime: section.start,
					endTime: section.end,
					labelText: section.label.toUpperCase(),
					color: color,
					editable: false
				});
			});
			
			console.log(`[PeaksPlayer] ✅ Added ${sectionsData.length} section segments`);
			
			// Also reduce marker opacity in overview after sections are added
			// Use multiple attempts with increasing delays
			const reduceOverviewOpacity = () => {
				const overviewEl = document.querySelector(`#${overviewId}`);
				if (overviewEl) {
					// Debug: log structure
					console.log('[PeaksPlayer] Overview element:', overviewEl);
					console.log('[PeaksPlayer] Overview HTML:', overviewEl.innerHTML.substring(0, 200));
					
					// Try multiple selectors
					let allLines = overviewEl.querySelectorAll('line');
					if (allLines.length === 0) {
						// Try looking in canvas or other elements
						allLines = document.querySelectorAll(`#${overviewId} line`);
					}
					if (allLines.length === 0) {
						// Try looking for all child elements
						const allChildren = overviewEl.querySelectorAll('*');
						console.log('[PeaksPlayer] Overview has', allChildren.length, 'child elements');
						console.log('[PeaksPlayer] First few:', Array.from(allChildren).slice(0, 5));
					}
					
					console.log(`[PeaksPlayer] Post-section: Found ${allLines.length} lines in overview`);
					if (allLines.length > 0) {
						allLines.forEach(line => {
							line.style.opacity = '0.02';
							line.style.strokeOpacity = '0.02';
						});
						console.log(`[PeaksPlayer] ✅ Reduced opacity for ${allLines.length} overview markers`);
					}
				}
			};
			
			setTimeout(reduceOverviewOpacity, 300);
			setTimeout(reduceOverviewOpacity, 600);
			setTimeout(reduceOverviewOpacity, 1000);
		} catch (e) {
			console.error('[PeaksPlayer] Error adding section segments:', e);
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
		<div class="header-left">
			<!-- Play/Pause button -->
			<button 
				class="play-btn"
				onclick={() => { isPlaying = !isPlaying; }}
				disabled={!isReady}
				title={isPlaying ? 'Pause' : 'Play'}
			>
				{#if isPlaying}
					<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
						<rect x="6" y="4" width="4" height="16"/>
						<rect x="14" y="4" width="4" height="16"/>
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
						<polygon points="5,3 19,12 5,21"/>
					</svg>
				{/if}
			</button>
			<!-- Time display -->
			<span class="time-display">
				{formatTime(currentTime)} / {formatTime(duration)}
			</span>
			<span class="label">Zoom View</span>
		</div>
        <div class="header-controls">
         {#if isReady}
         <div class="zoom-controls"> 
             <button onclick={zoomIn} title="Zoom in">+</button>
             <button onclick={zoomOut} title="Zoom out">-</button>
         </div>
         {/if}
         <button 
         	class="marker-toggle-btn" 
         	class:active={showMIDIMarkers}
         	class:has-data={midiMarkers && midiMarkers.length > 0}
         	disabled={!midiMarkers || midiMarkers.length === 0}
         	onclick={() => { 
         		const newVal = !showMIDIMarkers;
         		console.log('[PeaksPlayer] MIDI toggle clicked, changing from', showMIDIMarkers, 'to', newVal);
         		showMIDIMarkers = newVal; 
         		// Force immediate re-render
         		if (peaksInstance) {
         			console.log('[PeaksPlayer] Forcing immediate MIDI re-render');
         			renderMarkersSync(showOnsets, newVal, onsets ? [...onsets] : [], midiMarkers ? [...midiMarkers] : [], grid ? [...grid] : []);
         		}
         	}}
         	title={midiMarkers && midiMarkers.length > 0 ? `Toggle MIDI Markers (${midiMarkers.length})` : 'No MIDI markers'}
         >
         	MIDI {midiMarkers && midiMarkers.length > 0 ? `(${midiMarkers.length})` : '(0)'}
         </button>
         <button 
         	class="marker-toggle-btn" 
         	class:active={showOnsets}
         	class:has-data={onsets && onsets.length > 0}
         	disabled={!onsets || onsets.length === 0}
         	onclick={() => { 
         		const newVal = !showOnsets;
         		console.log('[PeaksPlayer] Onsets toggle clicked, changing from', showOnsets, 'to', newVal);
         		showOnsets = newVal; 
         		// Force immediate re-render
         		if (peaksInstance) {
         			console.log('[PeaksPlayer] Forcing immediate Onsets re-render');
         			renderMarkersSync(newVal, showMIDIMarkers, onsets ? [...onsets] : [], midiMarkers ? [...midiMarkers] : [], grid ? [...grid] : []);
         		}
         	}}
         	title={onsets && onsets.length > 0 ? `Toggle Essentia Onsets (${onsets.length})` : 'No onsets'}
         >
         	Onsets {onsets && onsets.length > 0 ? `(${onsets.length})` : '(0)'}
         </button>
        </div>
	</div>
	<div
		bind:this={zoomviewContainer}
		id={zoomId}
		class="peaks-zoomview"
		style:height="{zoomHeight}px"
		on:mousemove={(event) => updatePreview(event, 'zoomview', zoomviewContainer)}
		on:mouseleave={clearPreview}
	>
		{#if previewTarget === 'zoomview' && previewTime !== null}
			<div class="preview-playhead" style:left="{previewX}px"></div>
			<div class="preview-label" style:left="{previewLabelX}px">
				{formatTime(previewTime)}
			</div>
		{/if}
	</div>

	<div class="controls-header">
		<span class="label">Overview</span>
	</div>
	<div
		bind:this={overviewContainer}
		id={overviewId}
		class="peaks-overview"
		style:height="{overviewHeight}px"
		on:mousemove={(event) => updatePreview(event, 'overview', overviewContainer)}
		on:mouseleave={clearPreview}
	>
		{#if previewTarget === 'overview' && previewTime !== null}
			<div class="preview-playhead" style:left="{previewX}px"></div>
			<div class="preview-label" style:left="{previewLabelX}px">
				{formatTime(previewTime)}
			</div>
		{/if}
	</div>

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

	.preview-playhead {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 1px;
		background: rgba(255, 255, 255, 0.7);
		box-shadow: 0 0 6px rgba(168, 130, 255, 0.6);
		pointer-events: none;
		z-index: 5;
	}

	.preview-label {
		position: absolute;
		top: 6px;
		transform: translateX(-50%);
		background: rgba(15, 15, 15, 0.85);
		border: 1px solid rgba(168, 130, 255, 0.6);
		border-radius: 4px;
		padding: 2px 6px;
		font-size: 0.7rem;
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
		color: #d8c8ff;
		pointer-events: none;
		z-index: 6;
		white-space: nowrap;
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

	.header-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.play-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: linear-gradient(135deg, #5a3fc0, #8a6fd0);
		border: none;
		color: #fff;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.play-btn:hover:not(:disabled) {
		background: linear-gradient(135deg, #6a4fd0, #9a7fe0);
		transform: scale(1.05);
	}

	.play-btn:disabled {
		background: #333;
		cursor: not-allowed;
		opacity: 0.5;
	}

	.time-display {
		font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
		font-size: 0.75rem;
		color: #a882ff;
		background: #1a1a1a;
		padding: 4px 8px;
		border-radius: 4px;
		border: 1px solid #333;
		letter-spacing: 0.5px;
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
        transition: all 0.15s ease;
        border: 2px solid #444;
        background: #2a2a2a;
        color: #888;
    }

    .marker-toggle-btn:disabled {
        background: #1a1a1a;
        color: #555;
        border-color: #333;
        cursor: not-allowed;
        opacity: 0.5;
    }

    .marker-toggle-btn:not(:disabled):hover {
        background: #3a3a3a;
    }

    /* MIDI button - blue when active */
    .marker-toggle-btn:first-of-type.active.has-data {
        background: #64c8ff;
        border-color: #64c8ff;
        color: #000;
        font-weight: 600;
    }

    .marker-toggle-btn:first-of-type:not(.active).has-data {
        border-color: #64c8ff55;
        color: #64c8ff;
    }

    /* Onsets button - orange when active */
    .marker-toggle-btn:last-of-type.active.has-data {
        background: #ff8800;
        border-color: #ff8800;
        color: #000;
        font-weight: 600;
    }

    .marker-toggle-btn:last-of-type:not(.active).has-data {
        border-color: #ff880055;
        color: #ff8800;
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

    /* Reduce point marker opacity in overview to emphasize sections */
    .peaks-overview :global(svg) :global(line) {
        opacity: 0.05 !important;
    }
    
    /* Keep full opacity in zoom view */
    .peaks-zoomview :global(svg) :global(line) {
        opacity: 1 !important;
    }
</style>
