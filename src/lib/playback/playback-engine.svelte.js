import { sampleCurveAtTime } from '$lib/playback/speed-ramp.js';

export function canUseSpeedRamp({
	enableSpeedRamping,
	audioMasterEnabled,
	processedTimeRemap,
	speedCurveTimestep
}) {
	return (
		!!enableSpeedRamping &&
		!!audioMasterEnabled &&
		!!processedTimeRemap &&
		Number.isFinite(speedCurveTimestep) &&
		speedCurveTimestep > 0
	);
}

export function createPlaybackEngine({ targetFps = 24 } = {}) {
	let wasSpeedRampingEnabled = false;
	let speedRampTimeOffset = 0;

	function step({
		sharedAudioRef,
		audioAnalyzer,
		uniforms,
		checkBeatTriggers,
		audioMasterEnabled,
		shaderPlayerRef,
		enableSpeedRamping,
		processedSpeedCurve,
		processedTimeRemap,
		speedCurveTimestep,
		speedRampMinSpeed,
		speedRampMaxSpeed,
		log = console.log
	}) {
		if (!sharedAudioRef || sharedAudioRef.paused) return null;

		const audioCurrentTime = sharedAudioRef.currentTime;
		let currentSpeed = 1.0;
		let currentEnergy = 0;

		if (audioAnalyzer) {
			const { audioLevel, bassLevel, midLevel, trebleLevel } = audioAnalyzer.getAudioData();
			if (uniforms.u_audioLevel) uniforms.u_audioLevel.value = audioLevel;
			if (uniforms.u_bassLevel) uniforms.u_bassLevel.value = bassLevel;
			if (uniforms.u_midLevel) uniforms.u_midLevel.value = midLevel;
			if (uniforms.u_trebleLevel) uniforms.u_trebleLevel.value = trebleLevel;
		}

		checkBeatTriggers(audioCurrentTime);

		if (audioMasterEnabled && shaderPlayerRef) {
			const canRamp =
				!!enableSpeedRamping &&
				!!processedSpeedCurve &&
				!!processedTimeRemap &&
				Number.isFinite(speedCurveTimestep) &&
				speedCurveTimestep > 0;

			if (canRamp && !wasSpeedRampingEnabled) {
				const remapSample = sampleCurveAtTime(processedTimeRemap, audioCurrentTime, speedCurveTimestep);
				const rawRemappedTime = remapSample?.value ?? audioCurrentTime;
				speedRampTimeOffset = audioCurrentTime - rawRemappedTime;
				shaderPlayerRef.setDirectFrameMapping(true);
				log(
					`[SpeedRamp] Enabled at audio=${audioCurrentTime.toFixed(2)}s, rawRemap=${rawRemappedTime.toFixed(2)}s, offset=${speedRampTimeOffset.toFixed(2)}s`
				);
				wasSpeedRampingEnabled = true;
			} else if (!canRamp && wasSpeedRampingEnabled) {
				speedRampTimeOffset = 0;
				shaderPlayerRef.setDirectFrameMapping(false);
				wasSpeedRampingEnabled = false;
				log('[SpeedRamp] Disabled');
			}

			if (canRamp) {
				const speedSample = sampleCurveAtTime(processedSpeedCurve, audioCurrentTime, speedCurveTimestep);
				const remapSample = sampleCurveAtTime(processedTimeRemap, audioCurrentTime, speedCurveTimestep);

				if (speedSample && remapSample) {
					currentSpeed = speedSample.value;
					const speedRange = speedRampMaxSpeed - speedRampMinSpeed;
					currentEnergy = speedRange > 0 ? (currentSpeed - speedRampMinSpeed) / speedRange : 0;

					const remappedTime = remapSample.value + speedRampTimeOffset;
					if (Math.floor(audioCurrentTime) !== Math.floor(audioCurrentTime - 0.016)) {
						log(
							`[SpeedRamp] audio=${audioCurrentTime.toFixed(2)}s -> video=${remappedTime.toFixed(2)}s (speed=${currentSpeed.toFixed(2)}x)`
						);
					}
					shaderPlayerRef.setAudioTime(remappedTime, targetFps);
				} else {
					shaderPlayerRef.setAudioTime(audioCurrentTime, targetFps);
				}
			} else {
				shaderPlayerRef.setAudioTime(audioCurrentTime, targetFps);
			}
		}

		if (!audioMasterEnabled && shaderPlayerRef) {
			if (enableSpeedRamping && processedSpeedCurve) {
				const speedSample = sampleCurveAtTime(processedSpeedCurve, audioCurrentTime, speedCurveTimestep);
				if (speedSample) {
					currentSpeed = speedSample.value;
					const speedRange = speedRampMaxSpeed - speedRampMinSpeed;
					currentEnergy = speedRange > 0 ? (currentSpeed - speedRampMinSpeed) / speedRange : 0;
					shaderPlayerRef.setSpeed(currentSpeed);
				} else {
					shaderPlayerRef.setSpeed(1.0);
				}
			} else {
				shaderPlayerRef.setSpeed(1.0);
			}
		}

		return {
			audioCurrentTime,
			currentSpeed,
			currentEnergy
		};
	}

	return {
		step
	};
}

