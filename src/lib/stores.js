import { writable } from 'svelte/store';

/**
 * @typedef {object} VideoAsset
 * @property {string} id - A unique identifier for the video.
 * @property {File} file - The original File object.
 * @property {string} name - The name of the video file.
 * @property {string} objectUrl - The object URL for video playback.
 * @property {string | null} thumbnailUrl - The object URL for the thumbnail image.
 */

/**
 * @type {import('svelte/store').Writable<VideoAsset[]>}
 */
export const videoAssets = writable([]);

/**
 * @type {import('svelte/store').Writable<VideoAsset | null>}
 */
export const activeVideo = writable(null);
