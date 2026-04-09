<script>
	import { onMount, onDestroy, tick, untrack } from 'svelte';
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
		showSectionOverlays = $bindable(true), // Toggle structure section rectangles on the waveform
		sections = [], // Song structure sections (intro, verse, chorus, etc.)
		loopSectionIndex = -1, // Index of section being looped (-1 = none)
		currentTime = $bindable(0),
		duration = $bindable(0),
		isPlaying = $bindable(false),
		onSeek = (time) => {},
		onSegmentStart = (segment) => {},
		onSegmentEnd = (segment) => {},
		onSegmentClick = (segment) => {},
		onPreviewTime = (time) => {},
		onRestart = () => {}, // Callback for restart button
		onNextVideo = () => {}, // Callback for next video button
		onTogglePlayback = () => {}, // Callback for play/pause (parent is playback master)
		mediaElement = null, // External audio element
		grid = [], // 1/32 note grid markers
		/** Hex colors per section index — same order as sequencer / clip buckets */
		sectionColorPalette = [],
		/** Fired after user drags section handles (sync to analysis structure) */
		onSectionBoundsChange = (/** @type {number} */ _index, /** @type {number} */ _start, /** @type {number} */ _end) => {},
		/** Fired after user renames a structure section (double-click label) */
		onSectionLabelChange = (/** @type {number} */ _index, /** @type {string} */ _label) => {},
		/** Fired when user adds a segment via + Segment — parent inserts into structure + sequencer + buckets */
		onSectionAdd = (/** @type {{ start: number; end: number; label: string }} */ _payload) => {},
		/** Bumped on every structure mutation so overlays repaint (avoids stale fingerprint / shallow prop issues) */
		sectionStructureRevision = 0
	} = $props();

	let zoomviewContainer;
	let overviewContainer;
	// Must be reactive: $effect that paints markers/sections must re-run after Peaks.init assigns this.
	// $state.raw avoids deep-proxying the Peaks API object; reassignment still triggers effects.
	let peaksInstance = $state.raw(null);
	let isReady = $state(false);
	let previewTime = $state(null);
	let previewX = $state(0);
	let previewLabelX = $state(0);
	let previewTarget = $state(null);
	
	const id = Math.random().toString(36).substr(2, 9);
	const zoomId = `peaks-zoom-${id}`;
	const overviewId = `peaks-overview-${id}`;

	/** Section overlay fill alpha (20% more opaque than previous 0.38) */
	const SECTION_OVERLAY_ALPHA = Math.min(1, 0.38 * 1.2);

	function hexToRgba(hex, alpha = SECTION_OVERLAY_ALPHA) {
		if (typeof hex !== 'string' || !hex.startsWith('#')) return `rgba(200, 200, 200, ${alpha})`;
		const raw = hex.slice(1);
		const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
		if (full.length !== 6) return `rgba(200, 200, 200, ${alpha})`;
		const r = parseInt(full.slice(0, 2), 16);
		const g = parseInt(full.slice(2, 4), 16);
		const b = parseInt(full.slice(4, 6), 16);
		if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(200, 200, 200, ${alpha})`;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	}

	function attachSegmentEditingHandlers(peaks) {
		try {
			const zoomview = peaks.views?.getView?.('zoomview');
			const overview = peaks.views?.getView?.('overview');
			if (typeof zoomview?.enableSegmentDragging === 'function') {
				zoomview.enableSegmentDragging(true);
			}
			if (typeof overview?.enableSegmentDragging === 'function') {
				overview.enableSegmentDragging(true);
			}
		} catch (e) {
			console.warn('[PeaksPlayer] enableSegmentDragging:', e);
		}

		peaks.on('segments.dragend', (event) => {
			const seg = event?.segment;
			const sid = seg?.id;
			if (!sid || typeof sid !== 'string' || !sid.startsWith('section-')) return;
			const index = parseInt(sid.slice('section-'.length), 10);
			if (!Number.isInteger(index) || index < 0) return;
			const start = Number(seg.startTime);
			const end = Number(seg.endTime);
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
			onSectionBoundsChange(index, start, end);
		});

		peaks.on('segments.dblclick', (event) => {
			const seg = event?.segment;
			if (!seg) return;
			const sid = seg.id;
			const current = seg.labelText ?? '';
			const next =
				typeof window !== 'undefined' && window.prompt
					? window.prompt('Rename segment', current)
					: null;
			if (next === null) return;
			const label = next.trim() || current;
			seg.update({ labelText: label });
			if (typeof sid === 'string' && sid.startsWith('section-')) {
				const index = parseInt(sid.slice('section-'.length), 10);
				if (Number.isInteger(index) && index >= 0) {
					onSectionLabelChange(index, label);
				}
			}
		});

		peaks.on('points.dblclick', (event) => {
			const pt = event?.point;
			if (!pt) return;
			const current = pt.labelText ?? '';
			const next =
				typeof window !== 'undefined' && window.prompt
					? window.prompt('Rename marker', current)
					: null;
			if (next === null) return;
			pt.update({ labelText: next.trim() || current });
		});
	}

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

	function handlePlayPause() {
		if (typeof onTogglePlayback === 'function') {
			onTogglePlayback();
			return;
		}
		isPlaying = !isPlaying;
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
			const id = setTimeout(() => void initPeaks(), 100);
			return () => clearTimeout(id);
		}
	});

	/** Wait until the media element has readable metadata (Peaks decodes via Web Audio). */
	function waitForMediaMetadata(el) {
		return new Promise((resolve, reject) => {
			if (el.readyState >= 1) {
				resolve();
				return;
			}
			const onMeta = () => {
				el.removeEventListener('loadedmetadata', onMeta);
				el.removeEventListener('error', onErr);
				resolve();
			};
			const onErr = () => {
				el.removeEventListener('loadedmetadata', onMeta);
				el.removeEventListener('error', onErr);
				reject(el.error || new Error('Media load failed'));
			};
			el.addEventListener('loadedmetadata', onMeta);
			el.addEventListener('error', onErr);
		});
	}

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

		if (!audioEl.src) {
			console.warn('[PeaksPlayer] media element has no src yet; skip Peaks.init');
			return;
		}

		try {
			await waitForMediaMetadata(audioEl);
		} catch (e) {
			console.error('[PeaksPlayer] audio failed before Peaks.init:', e);
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
			enablePoints: true,
			enableSegments: true,
			zoomWaveformColor: waveColor,
			overviewWaveformColor: waveColor,
			playedWaveformColor: playedWaveColor,
			overviewHighlightRectangleColor: 'rgba(168, 130, 255, 0.4)',
			segments: Array.isArray(segments) ? segments : [],
			points: [],
			segmentOptions: {
				markers: true,
				overlay: true,
				waveformColor: waveColor,
				overlayColor: 'rgba(168, 130, 255, 0.3)',
				overlayOpacity: 0.35,
				overlayBorderColor: 'rgba(168, 130, 255, 1.0)',
				overlayBorderWidth: 2,
				overlayCornerRadius: 4,
				overlayOffset: 0,
				// Peaks API: 'top-left' | 'center' (not 'left')
				overlayLabelAlign: 'top-left',
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
			// 'overlap' disables Peaks' forced flush boundaries so gaps can exist between sections.
			// Non-overlap + gaps are enforced in VideoWorkbench when syncing bounds from dragend.
			try {
				peaks.views?.getView?.('zoomview')?.setSegmentDragMode?.('overlap');
				peaks.views?.getView?.('overview')?.setSegmentDragMode?.('overlap');
			} catch (e) {
				console.warn('[PeaksPlayer] setSegmentDragMode:', e);
			}
			// Ensure initial viewport is a strict duration fit. This avoids first-click zoom jumps.
			requestAnimationFrame(() => fitWaveformToView());
			
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

			peaks.on('segments.click', (event) => {
				const seg = event?.segment ?? event;
				onSegmentClick(seg);
			});

			attachSegmentEditingHandlers(peaks);

			// Markers + structure sections: reactive $effect runs after this callback
			// (avoids stale `sections` when analysis finishes after Peaks.init).
		});
	}

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
	const gridFingerprint = $derived(() => {
		if (!grid || grid.length === 0) return 'empty';
		const first = Number(grid[0]).toFixed(4);
		const last = Number(grid[grid.length - 1]).toFixed(4);
		return `${first}-${last}-${grid.length}`;
	});
	const sectionsFingerprint = $derived(() => {
		if (!sections || sections.length === 0) return 'empty';
		// Higher precision than 3dp so small handle moves still invalidate (toggle was masking this).
		return sections
			.map(
				(s) =>
					`${Number(s.start).toFixed(5)}-${Number(s.end).toFixed(5)}-${String(s.label ?? '')}`
			)
			.join('|');
	});
	
	$effect(() => {
		if (!peaksInstance) return;

		// Subscribe only to stable fingerprints + toggles — NOT raw array props.
		// Parent re-renders every frame (bind:currentTime) can pass new [] references for derived
		// arrays; tracking those here caused effect_update_depth_exceeded with Peaks fitToContainer/timeupdate.
		const _onsetsFp = onsetsFingerprint;
		const _midiFp = midiFingerprint;
		const _gridFp = gridFingerprint;
		const _sectionsFp = sectionsFingerprint;
		const _sectionsRev = sectionStructureRevision;
		const _showOnsets = showOnsets;
		const _showMIDI = showMIDIMarkers;
		const _showSectionOverlays = showSectionOverlays;
		const _loopSectionIndex = loopSectionIndex;
		void sectionColorPalette;

		untrack(() => {
			const currentOnsets = onsets ? [...onsets] : [];
			const currentMidi = midiMarkers ? [...midiMarkers] : [];
			const currentGrid = grid ? [...grid] : [];
			const currentSections = sections && sections.length > 0 ? [...sections] : [];

			console.log(
				`[PeaksPlayer] paint markers/sections: onsetsFp=${_onsetsFp}, midiFp=${_midiFp}, gridFp=${_gridFp}, sectionsFp=${_sectionsFp}, nSections=${currentSections.length}, loop=${_loopSectionIndex}`
			);

			renderMarkersSync(_showOnsets, _showMIDI, currentOnsets, currentMidi, currentGrid);

			if (_showSectionOverlays && _sectionsFp !== 'empty' && currentSections.length > 0) {
				renderSections(currentSections, _loopSectionIndex);
			} else {
				clearStructureSectionSegments();
			}
		});
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
			// Cap dense grid markers to keep waveform render responsive.
			const maxGridPoints = 800;
			const step = gridData.length > maxGridPoints ? Math.ceil(gridData.length / maxGridPoints) : 1;
            for (let i = 0; i < gridData.length; i += step) {
				const time = gridData[i];
                allPoints.push({
                    time,
                    labelText: '',
                    editable: false,
                    color: 'rgba(255, 255, 255, 0.05)',
                });
            }
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

        // 3. MIDI Markers (Blue) - match onset opacity
		if (shouldShowMIDI && midiData && midiData.length > 0) {
			console.log(`[PeaksPlayer] ✅ Adding ${midiData.length} MIDI markers`);
			midiData.forEach((time, i) => {
				const pointTime = typeof time === 'number' ? time : parseFloat(time);
				if (!isNaN(pointTime) && pointTime >= 0) {
					allPoints.push({
						time: pointTime,
						labelText: '',
						editable: false,
						color: 'rgba(100, 200, 255, 0.25)',  // 25% opacity blue (matches onset opacity)
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
			
			// Keep redraw minimal and avoid brittle DOM queries into Peaks internals.
			if (zoomview) {
				if (typeof zoomview.fitToContainer === 'function') {
					zoomview.fitToContainer();
				}
				if (typeof zoomview.showPoints === 'function') {
					zoomview.showPoints(true);
				}
			}
			if (overview) {
				if (typeof overview.fitToContainer === 'function') {
					overview.fitToContainer();
				}
				if (typeof overview.showPoints === 'function') {
					overview.showPoints(false);
				}
			}
			
			console.log(`[PeaksPlayer] Forced redraw of views`);
		} catch (e) {
			console.warn(`[PeaksPlayer] Error forcing redraw:`, e);
		}
	}
	
	function clearStructureSectionSegments() {
		if (!peaksInstance) return;
		try {
			const existingSegments = peaksInstance.segments.getSegments();
			const sectionSegments = existingSegments.filter((seg) => seg.id?.startsWith('section-'));
			for (const seg of sectionSegments) {
				peaksInstance.segments.removeById(seg.id);
			}
		} catch (e) {
			console.warn('[PeaksPlayer] Error clearing section segments:', e);
		}
	}

	function renderSections(sectionsData, activeLoopIndex = -1) {
		if (!peaksInstance || !sectionsData || sectionsData.length === 0) {
			return;
		}

		clearStructureSectionSegments();
		
		// Fallback tint when no palette (label-keyword hints)
		const keywordColors = {
			intro: `rgba(255, 200, 100, ${Math.min(1, 0.38 * 1.2)})`,
			verse: `rgba(100, 150, 255, ${Math.min(1, 0.38 * 1.2)})`,
			chorus: `rgba(255, 100, 150, ${Math.min(1, 0.42 * 1.2)})`,
			bridge: `rgba(150, 255, 100, ${Math.min(1, 0.38 * 1.2)})`,
			outro: `rgba(200, 100, 255, ${Math.min(1, 0.38 * 1.2)})`,
			default: `rgba(200, 200, 200, ${Math.min(1, 0.28 * 1.2)})`
		};

		const palette =
			Array.isArray(sectionColorPalette) && sectionColorPalette.length > 0
				? sectionColorPalette
				: null;

		// Highlight color for looped section - brighter and more vibrant
		const loopHighlightColor = `rgba(0, 255, 200, ${Math.min(1, 0.55 * 1.2)})`; // Cyan highlight

		let added = 0;
		try {
			sectionsData.forEach((section, index) => {
				if (!section) return;

				const start = Number(section.start);
				const end = Number(section.end);
				if (!Number.isFinite(start) || !Number.isFinite(end)) {
					console.warn(`[PeaksPlayer] Invalid section times at index ${index}:`, section);
					return;
				}
				if (end <= start) {
					console.warn(
						`[PeaksPlayer] Section ${index} invalid range: ${start} - ${end}`,
						section
					);
					return;
				}

				const labelRaw = section.label != null ? String(section.label) : '';
				const labelLower = labelRaw.toLowerCase();

				let color = keywordColors.default;
				if (palette) {
					color = hexToRgba(palette[index % palette.length], SECTION_OVERLAY_ALPHA);
				} else {
					for (const [key, c] of Object.entries(keywordColors)) {
						if (key !== 'default' && labelLower.includes(key)) {
							color = c;
							break;
						}
					}
				}
				
				// If this section is being looped, use highlight color
				const isLooped = activeLoopIndex >= 0 && index === activeLoopIndex;
				const finalColor = isLooped ? loopHighlightColor : color;
				
				const displayLabel = labelRaw ? labelRaw.toUpperCase() : `SECTION ${index + 1}`;
				const labelText = isLooped ? `🔁 ${displayLabel}` : displayLabel;
				
				// Editable handles like user-added segments; bounds sync via segments.dragend
				const segmentConfig = {
					id: `section-${index}`,
					startTime: start,
					endTime: end,
					labelText: labelText,
					color: finalColor,
					editable: true
				};

				if (isLooped) {
					segmentConfig.data = { isLooped: true };
				}

				peaksInstance.segments.add(segmentConfig);
				added++;
			});

			console.log(
				`[PeaksPlayer] ✅ Section segments: added ${added}/${sectionsData.length}${activeLoopIndex >= 0 ? ` (loop ${activeLoopIndex})` : ''}`
			);

			requestAnimationFrame(() => {
				try {
					fitWaveformToView();
					peaksInstance.views?.getView?.('zoomview')?.fitToContainer?.();
					peaksInstance.views?.getView?.('overview')?.fitToContainer?.();
				} catch (e) {
					console.warn('[PeaksPlayer] post-section layout:', e);
				}
			});
			
			// Update label colors for looped sections after a short delay to allow DOM to update
			if (activeLoopIndex >= 0) {
				setTimeout(() => {
					try {
						const zoomEl = document.querySelector(`#${zoomId}`);
						const overviewEl = document.querySelector(`#${overviewId}`);
						
						// Find segment labels that contain the loop emoji and style them
						[zoomEl, overviewEl].forEach(container => {
							if (!container) return;
							
							// Peaks.js creates segment labels in SVG text elements
							const textElements = container.querySelectorAll('text');
							textElements.forEach(textEl => {
								if (textEl.textContent?.includes('🔁')) {
									textEl.setAttribute('fill', '#00ffc8');
									textEl.style.fill = '#00ffc8';
									textEl.style.fontWeight = '600';
								}
							});
							
							// Also check for segment overlay labels in div elements
							const labelDivs = container.querySelectorAll('[class*="label"], [class*="segment"]');
							labelDivs.forEach(div => {
								if (div.textContent?.includes('🔁')) {
									div.style.color = '#00ffc8';
									div.style.fontWeight = '600';
								}
							});
						});
					} catch (e) {
						console.warn('[PeaksPlayer] Error updating label colors:', e);
					}
				}, 100);
			}
			
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
		if (!peaksInstance) return;

		const current = peaksInstance.player.getCurrentTime();
		const trackDur = peaksInstance.player?.getDuration?.() ?? duration ?? 0;
		let start = startTime ?? snapToGrid(current);
		let end = endTime ?? snapToGrid(current + 5);

		let label = labelText;
		if (label === undefined || label === null) {
			label =
				typeof window !== 'undefined' && window.prompt
					? window.prompt('Name this segment', 'New segment')
					: 'New segment';
			if (label === null) return;
		}
		const finalLabel = String(label).trim() || 'New segment';

		start = Math.max(0, Number(start));
		end = Math.max(start + 0.05, Number(end));
		if (trackDur > 0) {
			end = Math.min(end, trackDur);
			if (end <= start) end = Math.min(trackDur, start + 0.05);
		}

		// Structure sections are rendered from parent data; sync sequencer + clip buckets here.
		onSectionAdd({ start, end, label: finalLabel });
	}

	export function addPoint(time, labelText) {
		if (peaksInstance) {
			const current = peaksInstance.player.getCurrentTime();
			const pointTime = time ?? snapToGrid(current);

			let label = labelText;
			if (label === undefined || label === null) {
				label =
					typeof window !== 'undefined' && window.prompt
						? window.prompt('Name this marker', 'Marker')
						: 'Marker';
				if (label === null) return;
			}
			const finalLabel = String(label).trim() || 'Marker';

			peaksInstance.points.add({
				time: pointTime,
				labelText: finalLabel,
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

	const MIN_ZOOM_SECONDS = 0.15;
	const ZOOM_IN_FACTOR = 0.85;
	const ZOOM_OUT_FACTOR = 1.15;

	function getSafeDuration() {
		if (!peaksInstance) return 0;
		const playerDuration = peaksInstance.player?.getDuration?.() ?? 0;
		const fallbackDuration = Number.isFinite(duration) ? duration : 0;
		return Math.max(playerDuration, fallbackDuration);
	}

	function getCurrentZoomSpan() {
		const zoomview = peaksInstance?.views?.getView?.('zoomview');
		if (!zoomview) return 0;
		const start = typeof zoomview.getStartTime === 'function' ? zoomview.getStartTime() : 0;
		const end = typeof zoomview.getEndTime === 'function' ? zoomview.getEndTime() : 0;
		return Math.max(0, end - start);
	}

	function setZoomSpan(spanSeconds, anchorTime = null) {
		if (!peaksInstance) return;
		const zoomview = peaksInstance.views?.getView?.('zoomview');
		const overview = peaksInstance.views?.getView?.('overview');
		if (!zoomview || typeof zoomview.setZoom !== 'function') return;

		const trackDuration = getSafeDuration();
		if (!(trackDuration > 0)) return;

		const clampedSpan = Math.min(trackDuration, Math.max(MIN_ZOOM_SECONDS, spanSeconds));
		const currentAnchor =
			anchorTime ??
			peaksInstance.player?.getCurrentTime?.() ??
			(clampedSpan / 2);
		const maxStart = Math.max(0, trackDuration - clampedSpan);
		const targetStart = Math.min(maxStart, Math.max(0, currentAnchor - clampedSpan / 2));

		try {
			zoomview.setZoom({ seconds: clampedSpan });
			if (typeof zoomview.setStartTime === 'function') {
				zoomview.setStartTime(targetStart);
			}
		} catch (e) {
			console.warn('[PeaksPlayer] setZoomSpan failed:', e);
		}

		if (typeof zoomview.fitToContainer === 'function') {
			zoomview.fitToContainer();
		}
		if (typeof overview?.fitToContainer === 'function') {
			overview.fitToContainer();
		}
	}

	function fitWaveformToView() {
		if (!peaksInstance) return;
		const trackDuration = getSafeDuration();
		if (!(trackDuration > 0)) return;
		setZoomSpan(trackDuration, trackDuration / 2);
	}

	function clampZoomToDuration() {
		if (!peaksInstance || !(Number.isFinite(duration) && duration > 0)) return;
		const zoomview = peaksInstance.views?.getView?.('zoomview');
		if (!zoomview) return;

		const start = typeof zoomview.getStartTime === 'function' ? zoomview.getStartTime() : 0;
		const end = typeof zoomview.getEndTime === 'function' ? zoomview.getEndTime() : duration;
		const span = Math.max(0, end - start);

		// Prevent zoom-out from showing extra empty timeline past actual track length.
		if (end > duration + 0.05 || span > duration + 0.05) {
			fitWaveformToView();
		}
	}

    export function zoomIn() {
		if (!peaksInstance) return;
		const trackDuration = getSafeDuration();
		const currentSpan = getCurrentZoomSpan() || trackDuration;
		const nextSpan = Math.max(MIN_ZOOM_SECONDS, currentSpan * ZOOM_IN_FACTOR);
		setZoomSpan(nextSpan);
	}

    export function zoomOut() {
		if (!peaksInstance) return;
		const trackDuration = getSafeDuration();
		const currentSpan = getCurrentZoomSpan() || trackDuration;
		const nextSpan = Math.min(trackDuration, currentSpan * ZOOM_OUT_FACTOR);
		setZoomSpan(nextSpan);
		clampZoomToDuration();
	}

	export function fitZoom() {
		fitWaveformToView();
	}

	export function refreshLayout() {
		if (!peaksInstance) return;
		try {
			const zoomview = peaksInstance.views?.getView?.('zoomview');
			const overview = peaksInstance.views?.getView?.('overview');
			if (typeof zoomview?.fitToContainer === 'function') zoomview.fitToContainer();
			if (typeof overview?.fitToContainer === 'function') overview.fitToContainer();
			clampZoomToDuration();
		} catch (e) {
			console.warn('[PeaksPlayer] refreshLayout failed:', e);
		}
	}
</script>

<div class="peaks-container" class:loading={!isReady && audioFile}>
	<!-- Removed Hidden native audio element for Peaks to control - Parent provides it -->

	<div class="controls-header">
		<div class="header-left">
			<!-- Restart button -->
			<button 
				class="transport-btn restart-btn"
				type="button"
				onclick={onRestart}
				disabled={!isReady}
				title="Restart"
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
					<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
				</svg>
			</button>
			<!-- Play/Pause button -->
			<button 
				class="play-btn"
				type="button"
				onclick={handlePlayPause}
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
			<!-- Next Video button -->
			<button 
				class="transport-btn next-btn"
				type="button"
				onclick={onNextVideo}
				disabled={!isReady}
				title="Next Video"
			>
				<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
					<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
				</svg>
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
             <button type="button" onclick={zoomIn} title="Zoom in">+</button>
             <button type="button" onclick={zoomOut} title="Zoom out">-</button>
             <button type="button" onclick={fitZoom} title="Fit to view">Fit</button>
         </div>
         {/if}
         <button 
         	class="marker-toggle-btn marker-midi-btn" 
			type="button"
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
         	class="marker-toggle-btn marker-onsets-btn" 
			type="button"
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
         <button
         	class="marker-toggle-btn marker-sections-btn"
         	type="button"
         	class:active={showSectionOverlays}
         	class:has-data={sections && sections.length > 0}
         	disabled={!sections || sections.length === 0}
         	onclick={() => {
         		const newVal = !showSectionOverlays;
         		showSectionOverlays = newVal;
         		if (peaksInstance) {
         			if (newVal && sections && sections.length > 0) {
         				renderSections([...sections], loopSectionIndex);
         			} else {
         				clearStructureSectionSegments();
         			}
         		}
         	}}
         	title={sections && sections.length > 0 ? `Toggle section overlays (${sections.length})` : 'No structure sections'}
         >
         	Sections {sections && sections.length > 0 ? `(${sections.length})` : '(0)'}
         </button>
        </div>
	</div>
	<div
		bind:this={zoomviewContainer}
		id={zoomId}
		class="peaks-zoomview"
		style:height={`${zoomHeight}px`}
		role="img"
		aria-label="Audio waveform zoom view"
		onmousemove={(event) => updatePreview(event, 'zoomview', zoomviewContainer)}
		onmouseleave={clearPreview}
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
		style:height={`${overviewHeight}px`}
		role="img"
		aria-label="Audio waveform overview"
		onmousemove={(event) => updatePreview(event, 'overview', overviewContainer)}
		onmouseleave={clearPreview}
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
    <button type="button" onclick={() => zoomIn()}>Zoom In</button>
    <button type="button" onclick={() => zoomOut()}>Zoom Out</button>
    <button type="button" onclick={() => fitZoom()}>Fit</button>
    <div class="separator"></div>
    <button type="button" onclick={() => addSegment()}>+ Segment</button>
    <button type="button" onclick={() => addPoint()}>+ Point</button>
    <div class="separator"></div>
    <button type="button" onclick={() => logData()}>Log Data</button>
    <span class="toolbar-hint" title="Rename any segment or point"
      >Double-click a segment or point to rename</span
    >
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

	.transport-btn {
		width: 24px;
		height: 24px;
		border-radius: 4px;
		background: #2a2a2a;
		border: 1px solid #444;
		color: #fff;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}

	.transport-btn:hover:not(:disabled) {
		background: #3a3a3a;
		border-color: #555;
	}

	.transport-btn:disabled {
		background: #222;
		cursor: not-allowed;
		opacity: 0.4;
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
        min-width: 20px;
        width: auto;
        height: 20px;
        padding: 0 6px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 11px;
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
    .marker-midi-btn.active.has-data {
        background: #64c8ff;
        border-color: #64c8ff;
        color: #000;
        font-weight: 600;
    }

    .marker-midi-btn:not(.active).has-data {
        border-color: #64c8ff55;
        color: #64c8ff;
    }

    /* Onsets button - orange when active */
    .marker-onsets-btn.active.has-data {
        background: #ff8800;
        border-color: #ff8800;
        color: #000;
        font-weight: 600;
    }

    .marker-onsets-btn:not(.active).has-data {
        border-color: #ff880055;
        color: #ff8800;
    }

    /* Structure sections overlay toggle - violet when active */
    .marker-sections-btn.active.has-data {
        background: #a78bfa;
        border-color: #a78bfa;
        color: #000;
        font-weight: 600;
    }

    .marker-sections-btn:not(.active).has-data {
        border-color: #a78bfa55;
        color: #a78bfa;
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
        flex-wrap: wrap;
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

	/* Style for looped section labels - make them cyan to match the highlight */
	/* Target Peaks.js segment labels that contain the loop emoji */
	:global(.peaks-segment-label),
	:global([class*="peaks-segment"][class*="label"]) {
		transition: color 0.2s ease;
	}
	
	/* Use attribute selector to target segments with loop emoji in label */
	:global(.peaks-segment[data-is-looped="true"] .peaks-segment-label) {
		color: #00ffc8 !important;
		fill: #00ffc8 !important;
		font-weight: 600 !important;
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

	.toolbar-hint {
		font-size: 0.75rem;
		color: #888;
		max-width: 200px;
		line-height: 1.2;
	}

	/* Point markers are hidden in overview via showPoints(false); do not dim all SVG lines
	   or the overview waveform disappears (onset grid uses many thin lines). */
</style>
