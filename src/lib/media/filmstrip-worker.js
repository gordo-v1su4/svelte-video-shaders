/**
 * Filmstrip extraction worker (FreeCut pattern).
 * Receives a video File, extracts thumbnail tiles at a fixed rate using
 * mediabunny's CanvasSink, and posts back JPEG blobs with timestamps.
 */
import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';

const TILE_HEIGHT = 54;

self.onmessage = async (event) => {
	const { id, file, fps = 1, maxTiles = 60 } = event.data;
	try {
		const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new Error('No video track');
		const decodable = await videoTrack.canDecode();
		if (!decodable) throw new Error('Not decodable');

		const duration = await input.computeDuration();
		const first = await videoTrack.getFirstTimestamp();
		const aspect = (videoTrack.displayWidth || 16) / (videoTrack.displayHeight || 9);
		const tileWidth = Math.max(24, Math.round(TILE_HEIGHT * aspect));

		const count = Math.max(1, Math.min(maxTiles, Math.floor((duration - first) * fps)));
		const step = (duration - first) / count;
		const timestamps = Array.from({ length: count }, (_, i) => first + i * step);

		const sink = new CanvasSink(videoTrack, {
			height: TILE_HEIGHT,
			fit: 'contain',
			poolSize: 2
		});

		const tiles = [];
		for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
			if (!wrapped) continue;
			const canvas = wrapped.canvas;
			const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
			tiles.push({ timestamp: wrapped.timestamp, blob, width: tileWidth, height: TILE_HEIGHT });
			self.postMessage({
				id,
				type: 'tile',
				tile: tiles[tiles.length - 1],
				index: tiles.length - 1,
				total: count
			});
		}

		self.postMessage({ id, type: 'done', count: tiles.length, duration });
	} catch (err) {
		self.postMessage({ id, type: 'error', error: err?.message || String(err) });
	}
};
