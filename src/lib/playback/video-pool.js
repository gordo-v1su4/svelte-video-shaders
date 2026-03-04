export function resolveSectionPoolIndices(sectionVideoPools, sectionIndex, totalVideoCount, hasSections) {
	const pool = sectionVideoPools[sectionIndex];
	if (Array.isArray(pool)) return pool;

	if (hasSections) {
		return sectionIndex === 0 ? Array.from({ length: totalVideoCount }, (_, i) => i) : [];
	}

	return Array.from({ length: totalVideoCount }, (_, i) => i);
}

export function isVideoInSectionPool(
	sectionVideoPools,
	sectionIndex,
	videoIndex,
	totalVideoCount,
	hasSections
) {
	const pool = resolveSectionPoolIndices(sectionVideoPools, sectionIndex, totalVideoCount, hasSections);
	return pool.includes(videoIndex);
}

export function toggleVideoInSectionPool(sectionVideoPools, sectionIndex, videoIndex, totalVideoCount) {
	const nextPools = { ...sectionVideoPools };

	if (!nextPools[sectionIndex]) {
		nextPools[sectionIndex] = Array.from({ length: totalVideoCount }, (_, i) => i);
	}

	const pool = [...nextPools[sectionIndex]];
	const idx = pool.indexOf(videoIndex);
	if (idx >= 0) {
		pool.splice(idx, 1);
	} else {
		pool.push(videoIndex);
	}

	nextPools[sectionIndex] = pool;
	return nextPools;
}

export function remapSectionPoolsForFailures(sectionVideoPools, failedIndices) {
	if (!failedIndices || failedIndices.length === 0) return sectionVideoPools;

	const failedSet = new Set(failedIndices);
	const failedSorted = [...failedSet].sort((a, b) => a - b);
	const remapped = {};

	for (const [sectionKey, pool] of Object.entries(sectionVideoPools)) {
		if (!Array.isArray(pool)) continue;
		remapped[sectionKey] = pool
			.filter((index) => !failedSet.has(index))
			.map((index) => index - failedSorted.filter((failedIndex) => failedIndex < index).length)
			.filter((index) => index >= 0);
	}

	return remapped;
}

