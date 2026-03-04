export function findNextMarkerIndex(triggers, time) {
	const nextIndex = triggers.findIndex((marker) => marker > time);
	return nextIndex === -1 ? triggers.length : nextIndex;
}

/**
 * Runs marker-trigger logic for the current playback time window.
 * Side effects are delegated via callbacks to keep this module framework-agnostic.
 */
export function processTriggerFrame({
	time,
	isPlaying,
	triggers,
	state,
	markerCounter,
	markerSwapThreshold,
	enableJumpCuts,
	jumpCutRange,
	enableFXTriggers,
	enableGlitchMode,
	glitchFrameRange,
	glitchEnergyThreshold,
	sectionEnergy,
	shaderPlayerRef,
	onMarkerHit,
	onVideoSwap,
	onLog
}) {
	let { previousTime, nextMarkerIndex } = state;
	let nextCounter = markerCounter;
	let fxTriggered = false;

	// Reset cursor on pause/seek/large discontinuity.
	if (!isPlaying || time < previousTime || Math.abs(time - previousTime) > 1.0) {
		return {
			state: {
				previousTime: time,
				nextMarkerIndex: findNextMarkerIndex(triggers, time)
			},
			markerCounter: nextCounter,
			fxTriggered
		};
	}

	if (time > previousTime) {
		if (Math.floor(time) !== Math.floor(previousTime)) {
			onLog?.(`[Trigger] time=${time.toFixed(2)}, triggers=${triggers.length}`);
		}

		while (nextMarkerIndex < triggers.length) {
			const marker = triggers[nextMarkerIndex];
			if (marker > time) break;
			if (marker <= previousTime) {
				nextMarkerIndex++;
				continue;
			}

			onMarkerHit?.();
			nextCounter++;

			if (nextCounter >= markerSwapThreshold) {
				onVideoSwap?.(nextCounter, markerSwapThreshold);
				nextCounter = 0;
			}

			if (enableJumpCuts && shaderPlayerRef) {
				const jumpAmount = Math.floor(Math.random() * jumpCutRange * 2) - jumpCutRange;
				shaderPlayerRef.jumpFrames(jumpAmount);
			}

			if (enableFXTriggers) {
				fxTriggered = true;
			}

			if (enableGlitchMode && shaderPlayerRef && sectionEnergy > glitchEnergyThreshold) {
				const microJump = Math.floor(Math.random() * glitchFrameRange * 2) - glitchFrameRange;
				shaderPlayerRef.jumpFrames(microJump);
			}

			nextMarkerIndex++;
		}
	}

	return {
		state: {
			previousTime: time,
			nextMarkerIndex
		},
		markerCounter: nextCounter,
		fxTriggered
	};
}

