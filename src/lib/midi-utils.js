/**
 * MIDI file parser - extracts note-on events (triggers) from MIDI files
 * Supports both format 0 and format 1 MIDI files
 */

/**
 * Parse MIDI file and extract note-on events as timestamps
 * @param {File} midiFile - The MIDI file to parse
 * @returns {Promise<{times: number[], notes: number[], velocities: number[]}>}
 */
export async function parseMIDIFile(midiFile) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		
		reader.onload = (e) => {
			try {
				const arrayBuffer = e.target.result;
				const dataView = new DataView(arrayBuffer);
				const result = parseMIDIBuffer(dataView);
				resolve(result);
			} catch (error) {
				reject(new Error(`Failed to parse MIDI file: ${error.message}`));
			}
		};
		
		reader.onerror = () => reject(new Error('Failed to read MIDI file'));
		reader.readAsArrayBuffer(midiFile);
	});
}

/**
 * Parse MIDI buffer and extract note-on events
 * @param {DataView} dataView - DataView of the MIDI file
 * @returns {{times: number[], notes: number[], velocities: number[]}}
 */
function parseMIDIBuffer(dataView) {
	let offset = 0;
	const times = [];
	const notes = [];
	const velocities = [];
	
	// Check MIDI header
	if (readString(dataView, offset, 4) !== 'MThd') {
		throw new Error('Invalid MIDI file: missing MThd header');
	}
	offset += 4;
	
	// Read header length (should be 6)
	const headerLength = readUint32(dataView, offset);
	offset += 4;
	
	if (headerLength !== 6) {
		throw new Error('Invalid MIDI file: unexpected header length');
	}
	
	// Read format (0 = single track, 1 = multiple tracks, 2 = multiple songs)
	const format = readUint16(dataView, offset);
	offset += 2;
	
	// Read number of tracks
	const numTracks = readUint16(dataView, offset);
	offset += 2;
	
	// Read ticks per quarter note (TPQN)
	const ticksPerQuarterNote = readUint16(dataView, offset);
	offset += 2;
	
	// Default tempo (120 BPM = 500000 microseconds per quarter note)
	let tempo = 500000;
	let currentTime = 0; // in ticks
	let currentTimeSeconds = 0; // in seconds
	
	console.log(`[MIDI] File format: ${format}, Tracks: ${numTracks}, TPQN: ${ticksPerQuarterNote}`);
	
	// Parse all tracks
	for (let trackIndex = 0; trackIndex < numTracks; trackIndex++) {
		// Check for track header
		if (readString(dataView, offset, 4) !== 'MTrk') {
			console.warn(`[MIDI] Track ${trackIndex} missing MTrk header, skipping`);
			continue;
		}
		offset += 4;
		
		// Read track length
		const trackLength = readUint32(dataView, offset);
		offset += 4;
		
		const trackEnd = offset + trackLength;
		let trackTime = 0; // Reset time for each track in format 1
		
		// Parse track events
		while (offset < trackEnd) {
			// Read delta time (variable length)
			const deltaTimeResult = readVariableLength(dataView, offset);
			const deltaTime = deltaTimeResult.value;
			offset = deltaTimeResult.offset;
			
			// Update time
			if (format === 0) {
				// Format 0: single track, accumulate time
				currentTime += deltaTime;
			} else {
				// Format 1: multiple tracks, time is per-track
				trackTime += deltaTime;
				currentTime = trackTime;
			}
			
			// Convert ticks to seconds
			// seconds = (ticks / ticksPerQuarterNote) * (tempo / 1000000)
			currentTimeSeconds = (currentTime / ticksPerQuarterNote) * (tempo / 1000000);
			
			// Read status byte
			let statusByte = dataView.getUint8(offset);
			let usingRunningStatus = false;
			
			// Check for running status (status byte < 0x80 means use previous status)
			if (statusByte < 0x80) {
				// Running status - use previous status byte
				// We need to track the last status byte, but for simplicity, skip for now
				// Most MIDI files don't use running status extensively
				console.warn(`[MIDI] Running status detected at offset ${offset}, skipping (not fully supported)`);
				offset++; // Skip the data byte
				continue;
			}
			
			offset++;
			
			// Check for meta events
			if (statusByte === 0xFF) {
				const metaType = dataView.getUint8(offset);
				offset++;
				
				const metaLengthResult = readVariableLength(dataView, offset);
				const metaLength = metaLengthResult.value;
				offset = metaLengthResult.offset;
				
				// Handle tempo change (meta event 0x51)
				if (metaType === 0x51 && metaLength === 3) {
					const oldTempo = tempo;
					tempo = (dataView.getUint8(offset) << 16) |
					        (dataView.getUint8(offset + 1) << 8) |
					        dataView.getUint8(offset + 2);
					offset += 3;
					// Recalculate current time in seconds with new tempo
					// For events before tempo change, use old tempo; for events after, use new tempo
					// But we've already calculated currentTimeSeconds, so we need to recalculate from ticks
					currentTimeSeconds = (currentTime / ticksPerQuarterNote) * (tempo / 1000000);
					console.log(`[MIDI] Tempo change at ${currentTimeSeconds.toFixed(3)}s: ${oldTempo} -> ${tempo} (${60000000/tempo} BPM)`);
				} else {
					// Skip other meta events
					offset += metaLength;
				}
				continue;
			}
			
			// Check for system exclusive
			if (statusByte === 0xF0 || statusByte === 0xF7) {
				const sysexLengthResult = readVariableLength(dataView, offset);
				offset = sysexLengthResult.offset + sysexLengthResult.value;
				continue;
			}
			
			// Parse MIDI events
			const eventType = statusByte & 0xF0;
			const channel = statusByte & 0x0F;
			
			// Note On event (0x90-0x9F)
			if (eventType === 0x90) {
				const note = dataView.getUint8(offset);
				offset++;
				const velocity = dataView.getUint8(offset);
				offset++;
				
				// Note on with velocity 0 is treated as note off, but we'll include it
				if (velocity > 0) {
					times.push(currentTimeSeconds);
					notes.push(note);
					velocities.push(velocity);
				}
			}
			// Note Off event (0x80-0x8F) - we can ignore these for triggers
			else if (eventType === 0x80) {
				offset += 2; // Skip note and velocity
			}
			// Control Change (0xB0-0xBF)
			else if (eventType === 0xB0) {
				offset += 2; // Skip controller and value
			}
			// Program Change (0xC0-0xCF)
			else if (eventType === 0xC0) {
				offset += 1; // Skip program number
			}
			// Channel Aftertouch (0xD0-0xDF)
			else if (eventType === 0xD0) {
				offset += 1; // Skip pressure value
			}
			// Pitch Bend (0xE0-0xEF)
			else if (eventType === 0xE0) {
				offset += 2; // Skip LSB and MSB
			}
			// Polyphonic Aftertouch (0xA0-0xAF)
			else if (eventType === 0xA0) {
				offset += 2; // Skip note and pressure
			}
			else {
				// Unknown event type, skip
				console.warn(`[MIDI] Unknown event type: 0x${eventType.toString(16)}`);
			}
		}
	}
	
	// Sort by time (in case tracks are out of order)
	const sorted = times.map((time, index) => ({
		time: typeof time === 'number' ? time : parseFloat(time),
		note: notes[index],
		velocity: velocities[index]
	})).filter(item => !isNaN(item.time) && item.time >= 0)
	  .sort((a, b) => a.time - b.time);
	
	const result = {
		times: sorted.map(item => item.time),
		notes: sorted.map(item => item.note),
		velocities: sorted.map(item => item.velocity)
	};
	
	console.log(`[MIDI] Parsed ${result.times.length} note-on events`);
	if (result.times.length > 0) {
		console.log(`[MIDI] Time range: ${result.times[0].toFixed(3)}s - ${result.times[result.times.length - 1].toFixed(3)}s`);
		console.log(`[MIDI] Sample times:`, result.times.slice(0, 5).map(t => t.toFixed(3)));
	}
	
	return result;
}

/**
 * Read a string from DataView
 */
function readString(dataView, offset, length) {
	let str = '';
	for (let i = 0; i < length; i++) {
		str += String.fromCharCode(dataView.getUint8(offset + i));
	}
	return str;
}

/**
 * Read a 32-bit unsigned integer (big-endian)
 */
function readUint32(dataView, offset) {
	return (dataView.getUint8(offset) << 24) |
	       (dataView.getUint8(offset + 1) << 16) |
	       (dataView.getUint8(offset + 2) << 8) |
	       dataView.getUint8(offset + 3);
}

/**
 * Read a 16-bit unsigned integer (big-endian)
 */
function readUint16(dataView, offset) {
	return (dataView.getUint8(offset) << 8) | dataView.getUint8(offset + 1);
}

/**
 * Read a variable-length quantity (VLQ)
 * Returns {value, offset}
 */
function readVariableLength(dataView, offset) {
	let value = 0;
	let byte;
	
	do {
		byte = dataView.getUint8(offset);
		offset++;
		value = (value << 7) | (byte & 0x7F);
	} while (byte & 0x80);
	
	return { value, offset };
}

