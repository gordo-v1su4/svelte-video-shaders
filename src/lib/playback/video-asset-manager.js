function toFingerprint(name, size) {
	return `${name}-${size || 0}`;
}

export function filterDuplicateVideoFiles(files, existingAssets) {
	const existingFingerprints = new Set(
		existingAssets.map((asset) => toFingerprint(asset.name, asset.file?.size))
	);

	const newFiles = files.filter((file) => !existingFingerprints.has(toFingerprint(file.name, file.size)));
	return {
		newFiles,
		skippedCount: files.length - newFiles.length
	};
}

export function createVideoAsset(file, idFactory = () => crypto.randomUUID()) {
	return {
		id: idFactory(),
		file,
		name: file.name,
		objectUrl: URL.createObjectURL(file),
		thumbnailUrl: null
	};
}

export function resolveSectionUploadTarget(targetSectionIndex, hasSections, exclusiveToSection = false) {
	if (targetSectionIndex === null && hasSections) {
		return {
			targetSectionIndex: 0,
			exclusiveToSection: true
		};
	}

	return {
		targetSectionIndex,
		exclusiveToSection
	};
}

export function collectAssetIndicesByIds(assets, ids) {
	const idToIndex = new Map(assets.map((asset, index) => [asset.id, index]));
	return ids.map((id) => idToIndex.get(id)).filter((index) => Number.isInteger(index));
}

function uniqueSortedIndices(indices) {
	return [...new Set(indices)].sort((a, b) => a - b);
}

export function assignUploadedIndicesToSectionPools({
	sectionVideoPools,
	sectionsCount,
	getSectionPoolIndices,
	newIndices,
	targetSectionIndex,
	exclusiveToSection
}) {
	if (targetSectionIndex === null || newIndices.length === 0) return sectionVideoPools;

	const newIndexSet = new Set(newIndices);

	if (exclusiveToSection && sectionsCount > 0) {
		const nextPools = {};
		for (let i = 0; i < sectionsCount; i++) {
			nextPools[i] = getSectionPoolIndices(i).filter((index) => !newIndexSet.has(index));
		}
		nextPools[targetSectionIndex] = uniqueSortedIndices([
			...nextPools[targetSectionIndex],
			...newIndices
		]);
		return { ...sectionVideoPools, ...nextPools };
	}

	const existingPool = getSectionPoolIndices(targetSectionIndex);
	return {
		...sectionVideoPools,
		[targetSectionIndex]: uniqueSortedIndices([...existingPool, ...newIndices])
	};
}
