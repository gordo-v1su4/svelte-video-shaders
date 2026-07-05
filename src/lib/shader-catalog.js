import { vhsFragmentShader, vhsUniforms } from '$lib/shaders/vhs-shader.js';
import { xlsczNFragmentShader, xlsczNUniforms } from '$lib/shaders/xlsczn-shader.js';
import { waterFragmentShader, waterUniforms } from '$lib/shaders/water-shader.js';
import {
	chromaticAberrationFragmentShader,
	chromaticAberrationUniforms
} from '$lib/shaders/chromatic-aberration-shader.js';
import { glitchFragmentShader, glitchUniforms } from '$lib/shaders/glitch-shader.js';
import { noiseFragmentShader, noiseUniforms } from '$lib/shaders/noise-shader.js';
import { vignetteFragmentShader, vignetteUniforms } from '$lib/shaders/vignette-shader.js';
import { bloomFragmentShader, bloomUniforms } from '$lib/shaders/bloom-shader.js';
import {
	depthOfFieldFragmentShader,
	depthOfFieldUniforms
} from '$lib/shaders/depth-of-field-shader.js';
import { depthFragmentShader, depthUniforms } from '$lib/shaders/depth-shader.js';
import { sepiaFragmentShader, sepiaUniforms } from '$lib/shaders/sepia-shader.js';
import { scanlineFragmentShader, scanlineUniforms } from '$lib/shaders/scanline-shader.js';
import { pixelationFragmentShader, pixelationUniforms } from '$lib/shaders/pixelation-shader.js';
import { dotScreenFragmentShader, dotScreenUniforms } from '$lib/shaders/dot-screen-shader.js';
import {
	hueSaturationFragmentShader,
	hueSaturationUniforms
} from '$lib/shaders/hue-saturation-shader.js';
import {
	brightnessContrastFragmentShader,
	brightnessContrastUniforms
} from '$lib/shaders/brightness-contrast-shader.js';
import { colorDepthFragmentShader, colorDepthUniforms } from '$lib/shaders/color-depth-shader.js';
import {
	colorAverageFragmentShader,
	colorAverageUniforms
} from '$lib/shaders/color-average-shader.js';
import { tiltShiftFragmentShader, tiltShiftUniforms } from '$lib/shaders/tilt-shift-shader.js';
import {
	toneMappingFragmentShader,
	toneMappingUniforms
} from '$lib/shaders/tone-mapping-shader.js';
import { asciiFragmentShader, asciiUniforms } from '$lib/shaders/ascii-shader.js';
import { gridFragmentShader, gridUniforms } from '$lib/shaders/grid-shader.js';
import { lensFlareFragmentShader, lensFlareUniforms } from '$lib/shaders/lens-flare-shader.js';
import { crtFragmentShader, crtUniforms } from '$lib/shaders/crt-shader.js';
import {
	anamorphicBreatheFragmentShader,
	anamorphicBreatheUniforms
} from '$lib/shaders/anamorphic-breathe-shader.js';
import { filmGrainFragmentShader, filmGrainUniforms } from '$lib/shaders/film-grain-shader.js';
import {
	bleachBypassFragmentShader,
	bleachBypassUniforms
} from '$lib/shaders/bleach-bypass-shader.js';
import { duotoneFragmentShader, duotoneUniforms } from '$lib/shaders/duotone-shader.js';
import {
	kaleidoscopeFragmentShader,
	kaleidoscopeUniforms
} from '$lib/shaders/kaleidoscope-shader.js';
import { fisheyeFragmentShader, fisheyeUniforms } from '$lib/shaders/fisheye-shader.js';
import {
	datamoshLiteFragmentShader,
	datamoshLiteUniforms
} from '$lib/shaders/datamosh-lite-shader.js';

export const shaderCategories = [
	'Featured',
	'Analog/Retro',
	'Color',
	'Distortion',
	'Texture',
	'Cinematic',
	'Audio Reactive',
	'Utility/Technical'
];

function preset(id, label, values, description = '') {
	return { id, label, values, description };
}

function controls(keys) {
	return keys.map((key) => ({ key, label: key.replace(/^u_/, '').replaceAll('_', ' ') }));
}

function entry(
	id,
	label,
	category,
	description,
	tags,
	fragmentShader,
	defaultUniforms,
	presets,
	extra = {}
) {
	return {
		id,
		label,
		category,
		description,
		tags,
		fragmentShader,
		defaultUniforms,
		controls: controls(
			Object.keys(defaultUniforms || {}).filter((key) => key !== 'u_time' && key !== 'u_resolution')
		),
		presets,
		performance: extra.performance || 'low',
		requiresAudio: extra.requiresAudio || false,
		featured: extra.featured || false
	};
}

export const shaderCatalog = [
	entry(
		'VHS',
		'VHS Tape',
		'Analog/Retro',
		'Classic analog tape damage, scanlines, tracking, and RGB drift.',
		['retro', 'tape', 'glitch'],
		vhsFragmentShader,
		vhsUniforms,
		[
			preset('vhs-classic', 'Classic VHS', {
				u_distortion: 0.075,
				u_scanlineIntensity: 0.26,
				u_rgbShift: 0.0015,
				u_noise: 0.022,
				u_flickerIntensity: 0.5,
				u_trackingIntensity: 0.1,
				u_trackingSpeed: 1.2,
				u_trackingFreq: 8,
				u_waveAmplitude: 0.1
			}),
			preset('tape-tracking-storm', 'Tape Tracking Storm', {
				u_distortion: 0.22,
				u_scanlineIntensity: 0.52,
				u_rgbShift: 0.008,
				u_noise: 0.12,
				u_flickerIntensity: 1.4,
				u_trackingIntensity: 0.42,
				u_trackingSpeed: 2.8,
				u_trackingFreq: 18,
				u_waveAmplitude: 0.42
			})
		],
		{ featured: true }
	),
	entry(
		'XlsczN',
		'Bass Pulse XlsczN',
		'Audio Reactive',
		'Audio-level reactive waves and color pulses for music-driven edits.',
		['audio', 'pulse', 'music'],
		xlsczNFragmentShader,
		xlsczNUniforms,
		[
			preset('bass-pulse-xlsczn', 'Bass Pulse', {
				u_intensity: 1.2,
				u_colorShift: 0.65,
				u_pulseSpeed: 3.0,
				u_waveAmplitude: 1.25
			})
		],
		{ requiresAudio: true, featured: true }
	),
	entry(
		'Water',
		'Water Warp',
		'Distortion',
		'Soft ripples and refractions for dreamy transitions.',
		['warp', 'liquid'],
		waterFragmentShader,
		waterUniforms,
		[preset('water-soft', 'Soft Ripple', { u_factor: 0.55 })]
	),
	entry(
		'ChromaticAberration',
		'Prism Split',
		'Distortion',
		'Separates color channels from the center or edges.',
		['rgb', 'prism'],
		chromaticAberrationFragmentShader,
		chromaticAberrationUniforms,
		[
			preset('prism-glass', 'Prism Glass', {
				u_offset: [0.006, 0.002],
				u_radialModulation: 1,
				u_modulationOffset: 0.25
			})
		]
	),
	entry(
		'Glitch',
		'Glitch Cut',
		'Distortion',
		'Digital tearing and blocky temporal disruption.',
		['glitch', 'digital'],
		glitchFragmentShader,
		glitchUniforms,
		[
			preset('glitch-cut', 'Glitch Cut', {
				u_glitch_strength: 0.72,
				u_columns: 32,
				u_ratio: 0.72,
				u_duration: 0.35,
				u_delay: 0.9
			})
		],
		{ featured: true }
	),
	entry(
		'Noise',
		'Noise Texture',
		'Texture',
		'Adds procedural texture and grit.',
		['grain', 'texture'],
		noiseFragmentShader,
		noiseUniforms,
		[preset('noise-grit', 'Fine Grit', { u_opacity: 0.06, u_premultiply: 0 })]
	),
	entry(
		'Vignette',
		'Vignette Focus',
		'Cinematic',
		'Darkens edges to focus attention.',
		['focus', 'cinematic'],
		vignetteFragmentShader,
		vignetteUniforms,
		[
			preset('vignette-focus', 'Soft Focus', {
				u_offset_vignette: 0.45,
				u_darkness: 0.85,
				u_eskil: 0
			})
		]
	),
	entry(
		'Bloom',
		'Dream Bloom',
		'Cinematic',
		'Bright glow for dreamy highlights.',
		['glow', 'dream'],
		bloomFragmentShader,
		bloomUniforms,
		[
			preset('dream-bloom', 'Dream Bloom', {
				u_intensity_bloom: 1.75,
				u_luminanceThreshold: 0.62,
				u_luminanceSmoothing: 0.055
			})
		],
		{ featured: true, performance: 'medium' }
	),
	entry(
		'DepthOfField',
		'Depth of Field',
		'Cinematic',
		'Simulates focus falloff and bokeh.',
		['focus', 'bokeh'],
		depthOfFieldFragmentShader,
		depthOfFieldUniforms,
		[
			preset('soft-bokeh', 'Soft Bokeh', {
				u_focusDistance: 0.36,
				u_focusRange: 0.28,
				u_bokehScale: 2.4,
				u_focusPoint: [0.5, 0.5]
			})
		],
		{ performance: 'medium' }
	),
	entry(
		'Depth',
		'Depth Map Look',
		'Utility/Technical',
		'Stylized pseudo-depth visualization.',
		['utility'],
		depthFragmentShader,
		depthUniforms,
		[preset('depth-clean', 'Clean Depth', { u_near: 0, u_far: 1, u_inverted: 0 })]
	),
	entry(
		'Sepia',
		'Sepia Print',
		'Color',
		'Warm photographic sepia tint.',
		['warm', 'photo'],
		sepiaFragmentShader,
		sepiaUniforms,
		[preset('sepia-print', 'Sepia Print', { u_sepia_intensity: 0.9 })]
	),
	entry(
		'Scanline',
		'Scanline Overlay',
		'Analog/Retro',
		'Animated horizontal display lines.',
		['crt', 'scanline'],
		scanlineFragmentShader,
		scanlineUniforms,
		[
			preset('scanline-clean', 'Clean Scanlines', {
				u_scanline_density: 2.2,
				u_scanline_intensity: 0.24,
				u_scanline_width: 2.0,
				u_scanline_speed: 0.2,
				u_scanline_offset: 0
			})
		]
	),
	entry(
		'Pixelation',
		'Pixelate',
		'Utility/Technical',
		'Chunky low-resolution block look.',
		['pixel', 'retro'],
		pixelationFragmentShader,
		pixelationUniforms,
		[preset('pixel-pop', 'Pixel Pop', { u_granularity: 28 })]
	),
	entry(
		'DotScreen',
		'Dot Screen',
		'Texture',
		'Halftone print-dot pattern.',
		['print', 'halftone'],
		dotScreenFragmentShader,
		dotScreenUniforms,
		[preset('print-dot', 'Print Dot', { u_dot_angle: 1.57, u_dot_scale: 2.8 })]
	),
	entry(
		'HueSaturation',
		'Hue/Saturation',
		'Color',
		'Creative hue shifts and saturation control.',
		['color'],
		hueSaturationFragmentShader,
		hueSaturationUniforms,
		[preset('color-pop', 'Color Pop', { u_hue: 0.24, u_saturation: 0.35 })]
	),
	entry(
		'BrightnessContrast',
		'Brightness/Contrast',
		'Color',
		'Basic exposure and contrast shaping.',
		['utility', 'color'],
		brightnessContrastFragmentShader,
		brightnessContrastUniforms,
		[preset('punchy-contrast', 'Punchy Contrast', { u_brightness: 0.04, u_contrast: 0.28 })]
	),
	entry(
		'ColorDepth',
		'Color Depth',
		'Color',
		'Posterized limited-color palette.',
		['posterize', 'palette'],
		colorDepthFragmentShader,
		colorDepthUniforms,
		[preset('posterize-pop', 'Posterize Pop', { u_bits: 5 })]
	),
	entry(
		'ColorAverage',
		'Color Average',
		'Utility/Technical',
		'Averages color into a graphic monochrome look.',
		['utility'],
		colorAverageFragmentShader,
		colorAverageUniforms,
		[preset('average-clean', 'Average Clean', {})]
	),
	entry(
		'TiltShift',
		'Tilt Shift',
		'Cinematic',
		'Miniature lens blur band.',
		['lens', 'focus'],
		tiltShiftFragmentShader,
		tiltShiftUniforms,
		[
			preset('miniature', 'Miniature', {
				u_tilt_offset: 0.38,
				u_tilt_feather: 0.18,
				u_tilt_rotation: 0.05
			})
		],
		{ performance: 'medium' }
	),
	entry(
		'ToneMapping',
		'Tone Mapping',
		'Color',
		'HDR-style exposure and rolloff controls.',
		['exposure', 'hdr'],
		toneMappingFragmentShader,
		toneMappingUniforms,
		[
			preset('cinema-grade', 'Cinema Grade', {
				u_exposure: 1.25,
				u_maxLuminance: 12,
				u_middleGrey: 0.52
			})
		]
	),
	entry(
		'ASCII',
		'ASCII Video',
		'Texture',
		'Turns video into graphic character cells.',
		['ascii', 'text'],
		asciiFragmentShader,
		asciiUniforms,
		[preset('ascii-tight', 'Tight ASCII', { u_charSize: 7 })],
		{ performance: 'medium' }
	),
	entry(
		'Grid',
		'Cyber Grid',
		'Utility/Technical',
		'Graphic grid overlay for sci-fi rhythm edits.',
		['grid', 'cyber'],
		gridFragmentShader,
		gridUniforms,
		[preset('cyber-grid', 'Cyber Grid', { u_grid_scale: 5.5, u_grid_lineWidth: 0.018 })]
	),
	entry(
		'LensFlare',
		'Lens Flare',
		'Cinematic',
		'Flares, ghosts, halos, and anamorphic streaks.',
		['flare', 'cinematic'],
		lensFlareFragmentShader,
		lensFlareUniforms,
		[
			preset('anamorphic-flare', 'Anamorphic Flare', {
				u_flareBrightness: 1.45,
				u_flareSize: 0.007,
				u_flareSpeed: 0.35,
				u_flareShape: 0.2,
				u_anamorphic: 1,
				u_ghostScale: 0.12,
				u_haloScale: 0.75,
				u_starBurst: 1
			})
		],
		{ performance: 'high' }
	),
	entry(
		'CRT',
		'CRT Monitor',
		'Analog/Retro',
		'Curved screen, pixel grid, scanlines, dither, and vignette.',
		['crt', 'retro'],
		crtFragmentShader,
		crtUniforms,
		[
			preset('clean-crt', 'Clean CRT', {
				u_pixelSize: 4,
				u_distortion: 0.18,
				u_blur: 0.18,
				u_aberration: 0.025,
				u_scanlineIntensity: 0.04,
				u_scanlineSpeed: 80,
				u_gridIntensity: 0.08,
				u_vignetteIntensity: 0.8,
				u_dither: 0.08
			}),
			preset('broken-crt', 'Broken CRT', {
				u_pixelSize: 7,
				u_distortion: 0.52,
				u_blur: 0.36,
				u_aberration: 0.11,
				u_scanlineIntensity: 0.12,
				u_scanlineSpeed: 180,
				u_gridIntensity: 0.22,
				u_vignetteIntensity: 1.4,
				u_dither: 0.22
			})
		],
		{ featured: true }
	),
	entry(
		'AnamorphicBreathe',
		'Anamorphic Breathe',
		'Cinematic',
		'Chromatic/defocus breathing with music-video lens movement.',
		['lens', 'dream'],
		anamorphicBreatheFragmentShader,
		anamorphicBreatheUniforms,
		[
			preset('anamorphic-dream', 'Dreamy Breathe', {
				u_chromatic_amount: 0.5,
				u_chromatic_speed: 0.6,
				u_defocus_amount: 0.5,
				u_defocus_speed: 0.4,
				u_anamorphic_ratio: 1.5,
				u_breathe_intensity: 1.0
			})
		],
		{ featured: true }
	),
	entry(
		'FilmGrain',
		'Film Grain / Halation',
		'Cinematic',
		'Organic grain plus warm highlight bloom for filmic footage.',
		['film', 'grain', 'halation'],
		filmGrainFragmentShader,
		filmGrainUniforms,
		[
			preset('warm-halation', 'Warm Halation', { u_film_grain_amount: 0.08, u_halation: 0.42 }),
			preset('dirty-16mm', 'Dirty 16mm', { u_film_grain_amount: 0.18, u_halation: 0.32 })
		],
		{ featured: true }
	),
	entry(
		'BleachBypass',
		'Bleach Bypass',
		'Color',
		'Desaturated high-contrast music-video grade.',
		['grade', 'contrast'],
		bleachBypassFragmentShader,
		bleachBypassUniforms,
		[preset('silver-crush', 'Silver Crush', { u_bleach_amount: 0.72, u_bleach_contrast: 0.42 })],
		{ featured: true }
	),
	entry(
		'Duotone',
		'Duotone / Gradient Map',
		'Color',
		'Maps shadows and highlights to bold color pairs.',
		['duotone', 'color'],
		duotoneFragmentShader,
		duotoneUniforms,
		[
			preset('neon-magenta', 'Neon Magenta', {
				u_duotone_mix: 0.82,
				u_duotone_dark: [0.04, 0.02, 0.16],
				u_duotone_light: [1.0, 0.36, 0.82]
			}),
			preset('teal-gold', 'Teal Gold', {
				u_duotone_mix: 0.75,
				u_duotone_dark: [0.0, 0.18, 0.2],
				u_duotone_light: [1.0, 0.74, 0.24]
			})
		]
	),
	entry(
		'Kaleidoscope',
		'Kaleidoscope Tunnel',
		'Distortion',
		'Mirrored radial tunnel for chorus and drops.',
		['mirror', 'trippy'],
		kaleidoscopeFragmentShader,
		kaleidoscopeUniforms,
		[
			preset('mirror-tunnel', 'Mirror Tunnel', {
				u_kaleidoscope_segments: 7,
				u_kaleidoscope_twist: 1.4
			})
		],
		{ performance: 'medium' }
	),
	entry(
		'Fisheye',
		'Fisheye Lens Warp',
		'Distortion',
		'Wide-angle lens bend with vignette falloff.',
		['lens', 'warp'],
		fisheyeFragmentShader,
		fisheyeUniforms,
		[preset('wide-lens', 'Wide Lens', { u_fisheye_strength: 0.38, u_lens_zoom: 1.0 })]
	),
	entry(
		'DatamoshLite',
		'Datamosh Lite',
		'Distortion',
		'Block tearing and RGB smear without temporal buffers.',
		['datamosh', 'glitch'],
		datamoshLiteFragmentShader,
		datamoshLiteUniforms,
		[preset('block-tear', 'Block Tear', { u_datamosh_blocks: 20, u_datamosh_offset: 0.045 })],
		{ featured: true }
	)
];

export const shaderById = Object.fromEntries(shaderCatalog.map((item) => [item.id, item]));
export const shaderOptions = Object.fromEntries(shaderCatalog.map((item) => [item.label, item.id]));

export function getShaderById(id) {
	return shaderById[id] || shaderById.VHS;
}

export function getPreset(shaderId, presetId) {
	const shader = getShaderById(shaderId);
	return shader.presets.find((item) => item.id === presetId) || shader.presets[0];
}

export function applyPresetToUniforms(uniforms, shaderId, presetId) {
	const presetItem = getPreset(shaderId, presetId);
	for (const [key, value] of Object.entries(presetItem?.values || {})) {
		if (!uniforms[key]) uniforms[key] = { value };
		else uniforms[key].value = Array.isArray(value) ? [...value] : value;
	}
	return presetItem;
}

export function filterShaders({ category = 'Featured', search = '', hasAudio = false } = {}) {
	const q = search.trim().toLowerCase();
	return shaderCatalog.filter((shader) => {
		const inCategory =
			category === 'Featured' ? shader.featured : !category || shader.category === category;
		const text = `${shader.label} ${shader.description} ${shader.tags.join(' ')}`.toLowerCase();
		const matchesSearch = !q || text.includes(q);
		return (
			inCategory &&
			matchesSearch &&
			(hasAudio || !shader.requiresAudio || category === 'Audio Reactive')
		);
	});
}

export function getSmartShaderSuggestions({
	hasVideo = false,
	hasAudio = false,
	bpm = 0,
	energy = null
} = {}) {
	if (!hasVideo && !hasAudio) {
		return ['FilmGrain', 'BleachBypass', 'VHS', 'Bloom'].map(getShaderById);
	}
	if (hasAudio) {
		const highEnergy = Boolean(
			energy?.curve?.some?.((point) => (point.energy ?? point.value ?? 0) > 0.75)
		);
		return [
			highEnergy ? 'DatamoshLite' : 'AnamorphicBreathe',
			'XlsczN',
			'Glitch',
			bpm > 130 ? 'CRT' : 'Bloom'
		].map(getShaderById);
	}
	return ['BleachBypass', 'Duotone', 'Fisheye', 'FilmGrain'].map(getShaderById);
}
