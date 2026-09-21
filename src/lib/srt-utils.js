const TIMESTAMP_RE = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/;

export function secondsToSrtTime(seconds) {
	const safe = Math.max(0, Number(seconds) || 0);
	const h = Math.floor(safe / 3600);
	const m = Math.floor((safe % 3600) / 60);
	const s = Math.floor(safe % 60);
	const ms = Math.round((safe - Math.floor(safe)) * 1000);
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function srtTimeToSeconds(value) {
	const match = String(value || '')
		.trim()
		.match(TIMESTAMP_RE);
	if (!match) throw new Error(`Invalid SRT timestamp: ${value}`);
	const [, hh, mm, ss, ms] = match;
	return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
}

export function parseSRT(input) {
	const text = String(input || '')
		.replace(/\r/g, '')
		.trim();
	if (!text) return [];
	return text.split(/\n{2,}/).map((block, blockIndex) => {
		const lines = block.split('\n').filter(Boolean);
		const maybeIndex = /^\d+$/.test(lines[0]?.trim() || '')
			? Number(lines.shift())
			: blockIndex + 1;
		const timing = lines.shift();
		if (!timing?.includes('-->'))
			throw new Error(`Invalid SRT block ${maybeIndex}: missing timing`);
		const [startRaw, endRaw] = timing.split('-->').map((part) => part.trim());
		const start = srtTimeToSeconds(startRaw);
		const end = srtTimeToSeconds(endRaw);
		if (end <= start) throw new Error(`Invalid SRT block ${maybeIndex}: end must be after start`);
		return { index: maybeIndex, start, end, text: lines.join('\n').trim() };
	});
}

export function exportSRT(chunks) {
	return (chunks || [])
		.map((chunk, i) => {
			const index = chunk.index ?? i + 1;
			return [
				index,
				`${secondsToSrtTime(chunk.start)} --> ${secondsToSrtTime(chunk.end)}`,
				chunk.text || chunk.lyrics || '[instrumental]'
			].join('\n');
		})
		.join('\n\n');
}

function normalizeSections(sections, duration) {
	if (Array.isArray(sections) && sections.length > 0) {
		return sections.map((section, i) => ({
			index: i + 1,
			label: section.label || `Section ${i + 1}`,
			start: Math.max(0, Number(section.start) || 0),
			end: Math.max(Number(section.start) || 0, Number(section.end) || 0)
		}));
	}
	const total = Math.max(1, Number(duration) || 60);
	const count = Math.min(8, Math.max(3, Math.ceil(total / 20)));
	return Array.from({ length: count }, (_, i) => ({
		index: i + 1,
		label: `Part ${i + 1}`,
		start: (total / count) * i,
		end: (total / count) * (i + 1)
	}));
}

export function distributeLyricsAcrossSections(lyrics, sections = [], duration = 60) {
	const normalized = normalizeSections(sections, duration);
	const lines = String(lyrics || '')
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean);
	return normalized.map((section, i) => {
		const startLine = Math.floor((i / normalized.length) * Math.max(1, lines.length));
		const endLine = Math.floor(((i + 1) / normalized.length) * Math.max(1, lines.length));
		const selected = lines.slice(startLine, Math.max(endLine, startLine + 1));
		return {
			index: i + 1,
			start: section.start,
			end: section.end,
			label: section.label,
			text: selected.join('\n') || `[${section.label} instrumental]`
		};
	});
}
