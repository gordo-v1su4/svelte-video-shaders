export const PREFERRED_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

function moodFromText(text) {
	const lower = String(text || '').toLowerCase();
	if (/love|heart|touch|hold|kiss/.test(lower)) return 'intimate';
	if (/run|fire|fight|break|scream|storm/.test(lower)) return 'high-energy';
	if (/dream|night|moon|ghost|memory/.test(lower)) return 'dreamlike';
	if (/alone|lost|empty|rain|cold/.test(lower)) return 'melancholy';
	return 'cinematic';
}

function normalizeReferences(referenceImages = []) {
	return (Array.isArray(referenceImages) ? referenceImages : [])
		.map((reference, index) => ({
			id: reference.id || `reference-${index + 1}`,
			role: reference.role || (index === 0 ? 'character' : 'environment'),
			label:
				reference.label ||
				(index === 0 ? 'Main character reference' : `Environment moodboard ${index}`),
			mimeType: reference.mimeType || reference.mime_type || 'image/png',
			data: reference.data || reference.base64 || reference.imageBase64 || '',
			url: reference.url || reference.imageUrl || ''
		}))
		.filter((reference) => reference.data || reference.url || reference.label);
}

function summarizeInsightList(items = [], limit = 4) {
	return (Array.isArray(items) ? items : [])
		.slice(0, limit)
		.map((item) => `${item.label}${item.percent ? ` ${item.percent}%` : ''}`)
		.join(', ');
}

export function generateStoryDirectionOptions(
	chunks,
	{
		title = 'Lyric Film',
		transcriptSummary = null,
		summary = transcriptSummary?.summary || ''
	} = {}
) {
	const safeChunks = Array.isArray(chunks) ? chunks : [];
	const lyricSample = safeChunks
		.slice(0, 6)
		.map((chunk) => chunk.text)
		.filter(Boolean)
		.join(' / ');
	const topicCue = summarizeInsightList(transcriptSummary?.topics);
	const intentCue = summarizeInsightList(transcriptSummary?.intents);
	const analysisCue = [
		summary && `Summary: ${summary}`,
		topicCue && `Topics: ${topicCue}`,
		intentCue && `Intents: ${intentCue}`
	]
		.filter(Boolean)
		.join(' ');
	const sourceCue = analysisCue || lyricSample || 'the song analysis';
	const baseTitle = String(title || 'Lyric Film').replace(/\.[^.]+$/, '');

	return [
		{
			id: 'character-reckoning',
			label: 'Character reckoning',
			title: `${baseTitle}: The Reckoning`,
			logline:
				'One recurring protagonist turns the lyric conflict into a visible choice, escape, or transformation.',
			style:
				'grounded cinematic drama, expressive close-ups, tactile locations, controlled neon/cyan/lime accents',
			character:
				'a single central character with a readable wound, repeated gesture, and evolving costume/light motif',
			world:
				'urban night interiors, wet streets, transit corridors, rooms that shift from confinement to release',
			promptDirection: `Use ${sourceCue} to build a protagonist-led short film. Each SRT chunk should reveal one decision, memory, or action that escalates the character arc.`
		},
		{
			id: 'surreal-myth',
			label: 'Surreal myth',
			title: `${baseTitle}: Signal Myth`,
			logline:
				'The song becomes a symbolic myth where sound, memory, and desire appear as living visual forces.',
			style:
				'dreamlike surrealism, bold silhouettes, ritual motion, atmospheric haze, luminous purple/blue/green color',
			character:
				'a mythic figure or small ensemble guided by a recurring object, signal, animal, mask, or light source',
			world:
				'liminal rooms, impossible landscapes, flooded stages, glowing portals, natural elements behaving like music',
			promptDirection: `Use ${sourceCue} to create a symbolic story world. Each SRT chunk should introduce or transform one motif instead of illustrating lyrics literally.`
		},
		{
			id: 'performance-energy',
			label: 'Performance energy',
			title: `${baseTitle}: Livewire Cut`,
			logline:
				'A stylized performance video turns the song structure into kinetic scenes, dancers, light, and edit momentum.',
			style:
				'high-contrast music video, rhythmic camera motion, fast inserts, graphic lighting, glossy dark mode palette',
			character:
				'a performer or crew whose body movement, eye-line, and blocking sync tightly to words, beats, and onsets',
			world:
				'warehouse stages, LED corridors, projection rooms, streetlight exteriors, abstract graphic set pieces',
			promptDirection: `Use ${sourceCue} to make a beat-forward performance film. Each SRT chunk should specify camera movement, body action, and cut rhythm.`
		}
	];
}

export function generateStoryPlanFromChunks(
	chunks,
	{
		title = 'Lyric Film',
		imageModel = PREFERRED_GEMINI_IMAGE_MODEL,
		referenceImages = [],
		characterDirection = 'Use the character reference as the consistent main character across every generated shot.',
		environmentDirection = 'Use the environment references as moodboards for lighting, locations, color language, and texture.',
		storyArcHint = '',
		storyDirection = null
	} = {}
) {
	const safeChunks = Array.isArray(chunks) ? chunks : [];
	const references = normalizeReferences(referenceImages);
	const moods = safeChunks.map((chunk) => moodFromText(chunk.text));
	const dominantMood = moods[0] || 'cinematic';
	const storyTitle = storyDirection?.title || title || 'Lyric Film';
	const logline =
		storyDirection?.logline ||
		`A ${dominantMood} visual journey follows the song from its opening image to its final emotional release.`;
	const storySeed = [
		'Use the lyrics as emotional narration. Build a coherent music-video story with recurring visual motifs, evolving color, and section-specific imagery that lands with the song timing.',
		storyArcHint && `Deepgram analysis cues:\n${storyArcHint}`,
		storyDirection &&
			[
				`Selected creative direction: ${storyDirection.label}.`,
				`Style: ${storyDirection.style}.`,
				`Character: ${storyDirection.character}.`,
				`World: ${storyDirection.world}.`,
				`Direction: ${storyDirection.promptDirection}.`
			].join('\n')
	]
		.filter(Boolean)
		.join('\n\n');
	const directedCharacterDirection = storyDirection?.character || characterDirection;
	const directedEnvironmentDirection = storyDirection?.world || environmentDirection;
	return {
		title: storyTitle,
		logline,
		seed: storySeed,
		imageModel,
		referenceImages: references,
		characterDirection: directedCharacterDirection,
		environmentDirection: directedEnvironmentDirection,
		storyDirection,
		imageGenerationBrief: buildReferenceAwareImageBrief({
			title: storyTitle,
			logline,
			imageModel,
			referenceImages: references,
			characterDirection: directedCharacterDirection,
			environmentDirection: directedEnvironmentDirection
		}),
		chunks: safeChunks.map((chunk, i) => {
			const mood = moodFromText(chunk.text);
			return {
				...chunk,
				mood,
				tags: [mood, i === 0 ? 'opening' : i === safeChunks.length - 1 ? 'finale' : 'development'],
				prompt: buildChunkPrompt(chunk, mood, i, safeChunks.length),
				imagePrompt: buildReferenceAwareChunkPrompt({
					chunk,
					mood,
					index: i,
					total: safeChunks.length,
					referenceImages: references,
					characterDirection: directedCharacterDirection,
					environmentDirection: directedEnvironmentDirection
				})
			};
		})
	};
}

export function buildChunkPrompt(chunk, mood = moodFromText(chunk?.text), index = 0, total = 1) {
	const position = index === 0 ? 'opening' : index === total - 1 ? 'finale' : 'middle progression';
	return `Create a ${mood} cinematic music-video scene for the ${position}. Lyrics/section text: "${String(
		chunk?.text || ''
	)
		.replace(/\s+/g, ' ')
		.slice(
			0,
			280
		)}". Use expressive lighting, clear subject action, rhythmic motion, and a composition that can cut naturally to the next timed section.`;
}

export function buildReferenceAwareImageBrief({
	title = 'Lyric Film',
	logline = '',
	imageModel = PREFERRED_GEMINI_IMAGE_MODEL,
	referenceImages = [],
	characterDirection = 'Keep the same main character consistent.',
	environmentDirection = 'Use environment references as visual moodboards.'
} = {}) {
	const references = normalizeReferences(referenceImages);
	const characterRefs = references.filter((reference) => reference.role === 'character');
	const environmentRefs = references.filter((reference) => reference.role !== 'character');
	return [
		`Use model ${imageModel} for image generation.`,
		`Project: ${title}. ${logline}`.trim(),
		characterRefs.length
			? `${characterDirection} Character references: ${characterRefs.map((reference) => reference.label).join(', ')}.`
			: characterDirection,
		environmentRefs.length
			? `${environmentDirection} Environment references: ${environmentRefs.map((reference) => reference.label).join(', ')}.`
			: environmentDirection,
		'Create a dynamic 3x3 cinematic sequence/contact sheet when generating storyboard frames: varied angles, close-ups, wides, action, emotional beats, and continuity between panels.',
		'Do not copy every reference image literally; borrow mood, palette, layout, character consistency, and location texture.'
	].join('\n');
}

export function buildReferenceAwareChunkPrompt({
	chunk,
	mood = moodFromText(chunk?.text),
	index = 0,
	total = 1,
	referenceImages = [],
	characterDirection = 'Use the character reference as the consistent main character.',
	environmentDirection = 'Use the environment references as moodboards.'
} = {}) {
	const position = index === 0 ? 'opening' : index === total - 1 ? 'finale' : 'middle progression';
	const references = normalizeReferences(referenceImages);
	const hasCharacter = references.some((reference) => reference.role === 'character');
	const hasEnvironment = references.some((reference) => reference.role !== 'character');
	return [
		`Create panel ${index + 1} of ${total}: a ${mood} cinematic music-video ${position}.`,
		`Timed lyrics/section text: "${String(chunk?.text || '')
			.replace(/\s+/g, ' ')
			.slice(0, 320)}".`,
		hasCharacter
			? characterDirection
			: 'Invent or preserve one clear recurring protagonist for continuity.',
		hasEnvironment
			? environmentDirection
			: 'Keep location, palette, and lighting coherent with the overall story world.',
		'Prioritize clear subject action, expressive lighting, rhythmic motion, and composition that can cut naturally to adjacent SRT chunks.',
		'If producing a storyboard sheet, use varied camera angles and action progression instead of repeated poses.'
	].join(' ');
}

export function buildGeminiImageGenerationPayload({
	storyPlan,
	chunk = null,
	referenceImages = storyPlan?.referenceImages || [],
	imageModel = storyPlan?.imageModel || PREFERRED_GEMINI_IMAGE_MODEL,
	aspectRatio = '1:1',
	imageSize = '1K'
} = {}) {
	const references = normalizeReferences(referenceImages);
	const prompt =
		chunk?.imagePrompt || chunk?.prompt || storyPlan?.imageGenerationBrief || storyPlan?.seed || '';
	return {
		model: imageModel,
		responseModalities: ['TEXT', 'IMAGE'],
		imageConfig: { aspectRatio, imageSize },
		referenceImages: references,
		prompt,
		systemInstruction:
			storyPlan?.imageGenerationBrief ||
			buildReferenceAwareImageBrief({ imageModel, referenceImages: references })
	};
}
