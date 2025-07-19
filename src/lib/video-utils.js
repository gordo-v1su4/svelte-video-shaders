import { Input, BlobSource, ALL_FORMATS, CanvasSink } from 'mediabunny';

/**
 * Generates a thumbnail from a video file.
 * @param {File} file The video file.
 * @returns {Promise<string|null>} A promise that resolves to an object URL for the thumbnail, or null on error.
 */
export async function generateThumbnail(file) {
	try {
		const input = new Input({
			source: new BlobSource(file),
			formats: ALL_FORMATS
		});

		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) {
			console.error('No video track found in the file.');
			return null;
		}

		// Check if the track can be decoded
		const decodable = await videoTrack.canDecode();
		if (!decodable) {
			console.error('Video track cannot be decoded.');
			return null;
		}

		// Use CanvasSink for thumbnail generation (recommended approach)
		const sink = new CanvasSink(videoTrack, {
			width: 320 // Automatically resize the thumbnails
		});

		// Get the thumbnail at timestamp 1s (or start of video)
		const startTimestamp = await videoTrack.getFirstTimestamp();
		const thumbnailTimestamp = Math.max(startTimestamp, 1); // Use 1s or start of video

		const result = await sink.getCanvas(thumbnailTimestamp);
		const canvas = result.canvas;

		// Convert canvas to blob
		return new Promise((resolve) => {
			canvas.toBlob(
				(blob) => {
					if (blob) {
						resolve(URL.createObjectURL(blob));
					} else {
						resolve(null);
					}
				},
				'image/jpeg',
				0.8
			);
		});

	} catch (err) {
		console.error('Error generating thumbnail:', err);
		return null;
	}
}