/**
 * Filmstrip client - runs thumbnail extraction off the main thread and caches
 * object URLs per file. Used by clip buckets and the media panel for fast
 * visual previews right after files drop.
 */

let worker = null;
let nextId = 1;
/** @type {Map<number, { onTile: Function, onDone: Function, onError: Function }>} */
const pending = new Map();
/** @type {Map<string, { tiles: Array<{timestamp:number,url:string}>, promise: Promise<any> }>} */
const cache = new Map();

function getWorker() {
	if (!worker) {
		worker = new Worker(new URL('./filmstrip-worker.js', import.meta.url), { type: 'module' });
		worker.onmessage = (event) => {
			const { id, type } = event.data;
			const handlers = pending.get(id);
			if (!handlers) return;
			if (type === 'tile') handlers.onTile(event.data.tile, event.data.index, event.data.total);
			else if (type === 'done') {
				handlers.onDone(event.data);
				pending.delete(id);
			} else if (type === 'error') {
				handlers.onError(new Error(event.data.error));
				pending.delete(id);
			}
		};
	}
	return worker;
}

function fileKey(file) {
	return `${file.name}-${file.size}-${file.lastModified}`;
}

/**
 * Extract a filmstrip for a video file. Resolves with tile list; tiles also
 * stream in through onTile for progressive rendering.
 * @param {File} file
 * @param {{ fps?: number, maxTiles?: number, onTile?: (tile: {timestamp:number,url:string}, index:number, total:number) => void }} options
 * @returns {Promise<Array<{timestamp:number, url:string}>>}
 */
export function getFilmstrip(file, { fps = 1, maxTiles = 48, onTile } = {}) {
	const key = fileKey(file);
	const cached = cache.get(key);
	if (cached) {
		if (onTile) cached.tiles.forEach((tile, i) => onTile(tile, i, cached.tiles.length));
		return cached.promise;
	}

	const tiles = [];
	const id = nextId++;
	const promise = new Promise((resolve, reject) => {
		pending.set(id, {
			onTile: (tile, index, total) => {
				const url = URL.createObjectURL(tile.blob);
				const entry = { timestamp: tile.timestamp, url, width: tile.width, height: tile.height };
				tiles.push(entry);
				onTile?.(entry, index, total);
			},
			onDone: () => resolve(tiles),
			onError: (err) => {
				cache.delete(key);
				reject(err);
			}
		});
		getWorker().postMessage({ id, file, fps, maxTiles });
	});

	cache.set(key, { tiles, promise });
	return promise;
}

/** Release all cached filmstrip object URLs (e.g. on project reset). */
export function clearFilmstripCache() {
	for (const { tiles } of cache.values()) {
		for (const tile of tiles) URL.revokeObjectURL(tile.url);
	}
	cache.clear();
}
