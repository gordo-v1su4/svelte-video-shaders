/**
 * MP4 export - offline render loop in the FreeCut canvas-render-orchestrator
 * style:
 *
 *   deterministic edit timeline -> per-clip mediabunny decode runs ->
 *   Three.js shader render to an offscreen canvas -> WebCodecs H.264 encode
 *   via mediabunny Output, muxed with the song audio.
 */

import * as THREE from 'three';
import {
	Input,
	BlobSource,
	ALL_FORMATS,
	CanvasSink,
	Output,
	BufferTarget,
	Mp4OutputFormat,
	VideoSampleSource,
	AudioBufferSource,
	VideoSample,
	getFirstEncodableVideoCodec,
	getFirstEncodableAudioCodec
} from 'mediabunny';
import { buildEditTimeline, groupTimelineIntoRuns } from './edit-timeline.js';

const VERTEX_SHADER = `
	varying vec2 v_uv;
	void main() {
		v_uv = vec2(uv.x, 1.0 - uv.y);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`;

const PASSTHROUGH_FRAGMENT = `
	varying vec2 v_uv;
	uniform sampler2D u_texture;
	void main() {
		gl_FragColor = texture2D(u_texture, v_uv);
	}
`;

function toThreeUniformValue(value) {
	if (Array.isArray(value)) {
		if (value.length === 2) return new THREE.Vector2(value[0], value[1]);
		if (value.length === 3) return new THREE.Vector3(value[0], value[1], value[2]);
	}
	return value;
}

/** Per-frame RMS levels from the decoded song for audio-reactive uniforms. */
function computeAudioLevels(audioBuffer, fps, totalFrames) {
	const levels = new Float32Array(totalFrames);
	if (!audioBuffer) return levels;
	const data = audioBuffer.getChannelData(0);
	const samplesPerFrame = Math.floor(audioBuffer.sampleRate / fps);
	for (let f = 0; f < totalFrames; f++) {
		const start = f * samplesPerFrame;
		const end = Math.min(data.length, start + samplesPerFrame);
		if (start >= data.length) break;
		let sum = 0;
		for (let i = start; i < end; i++) sum += data[i] * data[i];
		levels[f] = Math.min(1, Math.sqrt(sum / Math.max(1, end - start)) * 2.5);
	}
	return levels;
}

/**
 * @param {object} params
 * @param {File} params.audioFile - the song (becomes the audio track)
 * @param {number} params.durationSec
 * @param {Array<{file: File}>} params.clips - video assets in pool order
 * @param {object} params.edit - timeline params (see buildEditTimeline)
 * @param {string} params.fragmentShader
 * @param {Record<string, {value: any}>} params.uniforms - uniform snapshot
 * @param {number} [params.fps]
 * @param {number} [params.width]
 * @param {number} [params.height]
 * @param {(progress: number, status: string) => void} [params.onProgress]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<Blob>} the finished MP4
 */
export async function exportVideo({
	audioFile,
	durationSec,
	clips,
	edit,
	fragmentShader,
	uniforms = {},
	fps = 24,
	width = 1920,
	height = 1080,
	onProgress = () => {},
	signal
}) {
	const throwIfAborted = () => {
		if (signal?.aborted) throw new DOMException('Export canceled', 'AbortError');
	};

	onProgress(0, 'Preparing export...');

	// --- Decode audio for the audio track + reactive levels ---
	let audioBuffer = null;
	if (audioFile) {
		const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
		const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
		const arrayBuffer = await audioFile.arrayBuffer();
		const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
		await decodeCtx.close();
		// Trim/pad to export duration via OfflineAudioContext render
		const sampleRate = decoded.sampleRate;
		const offline = new OfflineCtx(
			Math.min(2, decoded.numberOfChannels),
			Math.ceil(durationSec * sampleRate),
			sampleRate
		);
		const src = offline.createBufferSource();
		src.buffer = decoded;
		src.connect(offline.destination);
		src.start(0);
		audioBuffer = await offline.startRendering();
	}
	throwIfAborted();

	// --- Build the deterministic timeline ---
	const timeline = buildEditTimeline({ ...edit, durationSec, fps });
	const runs = groupTimelineIntoRuns(timeline);
	const totalFrames = timeline.length;
	const audioLevels = computeAudioLevels(audioBuffer, fps, totalFrames);

	// --- Open per-clip extraction sinks at export resolution ---
	const clipSinks = new Array(clips.length).fill(null);
	const clipMeta = new Array(clips.length).fill(null);
	const usedClips = new Set(runs.map((r) => r.clipIndex).filter((c) => c !== null));
	for (const clipIndex of usedClips) {
		const input = new Input({
			source: new BlobSource(clips[clipIndex].file),
			formats: ALL_FORMATS
		});
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) continue;
		const firstTimestamp = await videoTrack.getFirstTimestamp();
		clipSinks[clipIndex] = new CanvasSink(videoTrack, {
			width,
			height,
			fit: 'cover',
			poolSize: 2
		});
		clipMeta[clipIndex] = { firstTimestamp };
	}
	throwIfAborted();

	// --- Three.js offline scene mirroring ShaderPlayer ---
	const canvas = new OffscreenCanvas(width, height);
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
	renderer.setPixelRatio(1);
	renderer.setSize(width, height, false);
	renderer.setClearColor(0x000000, 1);
	const scene = new THREE.Scene();
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
	camera.position.z = 1;

	const texture = new THREE.Texture();
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;
	texture.flipY = false;

	const materialUniforms = { u_texture: { value: texture } };
	for (const key in uniforms) {
		materialUniforms[key] = { value: toThreeUniformValue(uniforms[key]?.value) };
	}
	if (materialUniforms.u_resolution?.value instanceof THREE.Vector2) {
		materialUniforms.u_resolution.value.set(width, height);
	}

	const material = new THREE.ShaderMaterial({
		uniforms: materialUniforms,
		vertexShader: VERTEX_SHADER,
		fragmentShader: fragmentShader || PASSTHROUGH_FRAGMENT
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
	scene.add(mesh);

	// --- mediabunny output ---
	const videoCodec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], {
		width,
		height
	});
	if (!videoCodec) throw new Error('No supported video encoder available in this browser.');

	const output = new Output({
		format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
		target: new BufferTarget()
	});

	const videoSource = new VideoSampleSource({
		codec: videoCodec,
		bitrate: Math.round(width * height * fps * 0.12)
	});
	output.addVideoTrack(videoSource, { frameRate: fps });

	let audioSource = null;
	if (audioBuffer) {
		const audioCodec = await getFirstEncodableAudioCodec(['aac', 'opus'], {
			numberOfChannels: audioBuffer.numberOfChannels,
			sampleRate: audioBuffer.sampleRate
		});
		if (audioCodec) {
			audioSource = new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 });
			output.addAudioTrack(audioSource);
		}
	}

	await output.start();

	try {
		if (audioSource) {
			onProgress(0.02, 'Encoding audio...');
			await audioSource.add(audioBuffer);
			audioSource.close();
		}
		throwIfAborted();

		const frameDuration = 1 / fps;
		let framesDone = 0;

		const renderAndEncode = async (sourceCanvas, outputFrame) => {
			if (sourceCanvas) {
				texture.image = sourceCanvas;
				texture.needsUpdate = true;
				mesh.visible = true;
			} else {
				mesh.visible = false;
			}
			const t = outputFrame / fps;
			if (materialUniforms.u_time) materialUniforms.u_time.value = t;
			if (materialUniforms.u_audioLevel)
				materialUniforms.u_audioLevel.value = audioLevels[outputFrame] || 0;
			renderer.render(scene, camera);

			const sample = new VideoSample(canvas, { timestamp: t, duration: frameDuration });
			await videoSource.add(sample);
			sample.close();

			framesDone++;
			if (framesDone % 12 === 0 || framesDone === totalFrames) {
				onProgress(
					0.05 + 0.9 * (framesDone / totalFrames),
					`Rendering frame ${framesDone}/${totalFrames}`
				);
			}
		};

		for (const run of runs) {
			throwIfAborted();
			const sink = run.clipIndex !== null ? clipSinks[run.clipIndex] : null;
			if (!sink) {
				// Blackout or missing clip: render black frames
				for (const entry of run.entries) {
					await renderAndEncode(null, entry.outputFrame);
				}
				continue;
			}

			const meta = clipMeta[run.clipIndex];
			const timestamps = run.entries.map((entry) => meta.firstTimestamp + entry.localFrame / fps);
			let i = 0;
			let lastCanvas = null;
			for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
				throwIfAborted();
				const entry = run.entries[i++];
				if (wrapped) lastCanvas = wrapped.canvas;
				await renderAndEncode(wrapped?.canvas || lastCanvas, entry.outputFrame);
			}
			// If the iterator ended early, pad with the last decoded canvas
			while (i < run.entries.length) {
				await renderAndEncode(lastCanvas, run.entries[i++].outputFrame);
			}
		}

		videoSource.close();
		onProgress(0.97, 'Finalizing MP4...');
		await output.finalize();
	} catch (err) {
		try {
			await output.cancel();
		} catch {
			/* ignore */
		}
		throw err;
	} finally {
		renderer.dispose();
		texture.dispose();
		material.dispose();
	}

	onProgress(1, 'Export complete');
	return new Blob([output.target.buffer], { type: 'video/mp4' });
}
