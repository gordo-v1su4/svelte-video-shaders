import { vhsFragmentShader } from '$lib/shaders/vhs-shader.js';
import { xlsczNFragmentShader } from '$lib/shaders/xlsczn-shader.js';
import { waterFragmentShader } from '$lib/shaders/water-shader.js';
import { chromaticAberrationFragmentShader } from '$lib/shaders/chromatic-aberration-shader.js';
import { glitchFragmentShader } from '$lib/shaders/glitch-shader.js';
import { noiseFragmentShader } from '$lib/shaders/noise-shader.js';
import { vignetteFragmentShader } from '$lib/shaders/vignette-shader.js';
import { bloomFragmentShader } from '$lib/shaders/bloom-shader.js';
import { depthOfFieldFragmentShader } from '$lib/shaders/depth-of-field-shader.js';
import { depthFragmentShader } from '$lib/shaders/depth-shader.js';
import { sepiaFragmentShader } from '$lib/shaders/sepia-shader.js';
import { scanlineFragmentShader } from '$lib/shaders/scanline-shader.js';
import { pixelationFragmentShader } from '$lib/shaders/pixelation-shader.js';
import { dotScreenFragmentShader } from '$lib/shaders/dot-screen-shader.js';
import { hueSaturationFragmentShader } from '$lib/shaders/hue-saturation-shader.js';
import { brightnessContrastFragmentShader } from '$lib/shaders/brightness-contrast-shader.js';
import { colorDepthFragmentShader } from '$lib/shaders/color-depth-shader.js';
import { colorAverageFragmentShader } from '$lib/shaders/color-average-shader.js';
import { tiltShiftFragmentShader } from '$lib/shaders/tilt-shift-shader.js';
import { toneMappingFragmentShader } from '$lib/shaders/tone-mapping-shader.js';
import { asciiFragmentShader } from '$lib/shaders/ascii-shader.js';
import { gridFragmentShader } from '$lib/shaders/grid-shader.js';
import { lensFlareFragmentShader } from '$lib/shaders/lens-flare-shader.js';
import { crtFragmentShader } from '$lib/shaders/crt-shader.js';
import { anamorphicBreatheFragmentShader } from '$lib/shaders/anamorphic-breathe-shader.js';

const inlineShaders = {
	Grayscale: `
		varying vec2 v_uv;
		uniform sampler2D u_texture;
		uniform float u_strength;

		void main() {
			vec4 color = texture2D(u_texture, v_uv);
			float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
			gl_FragColor = vec4(mix(color.rgb, vec3(gray), u_strength), color.a);
		}
	`,
	Vignette: `
		varying vec2 v_uv;
		uniform sampler2D u_texture;
		uniform float u_vignette_strength;
		uniform float u_vignette_falloff;

		void main() {
			vec4 color = texture2D(u_texture, v_uv);
			float dist = distance(v_uv, vec2(0.5));
			float vignette = smoothstep(u_vignette_falloff, u_vignette_strength, dist);
			gl_FragColor = vec4(color.rgb * (1.0 - vignette), color.a);
		}
	`
};

export const shaderOptions = {
	VHS: 'VHS',
	XlsczN: 'XlsczN',
	Water: 'Water',
	ChromaticAberration: 'ChromaticAberration',
	Glitch: 'Glitch',
	Noise: 'Noise',
	Vignette: 'Vignette',
	Bloom: 'Bloom',
	DepthOfField: 'DepthOfField',
	Depth: 'Depth',
	Sepia: 'Sepia',
	Scanline: 'Scanline',
	Pixelation: 'Pixelation',
	DotScreen: 'DotScreen',
	HueSaturation: 'HueSaturation',
	BrightnessContrast: 'BrightnessContrast',
	ColorDepth: 'ColorDepth',
	ColorAverage: 'ColorAverage',
	TiltShift: 'TiltShift',
	ToneMapping: 'ToneMapping',
	ASCII: 'ASCII',
	Grid: 'Grid',
	LensFlare: 'LensFlare',
	CRT: 'CRT',
	AnamorphicBreathe: 'AnamorphicBreathe',
	Grayscale: 'Grayscale'
};

export function getFragmentShaderByName(selectedShaderName) {
	switch (selectedShaderName) {
		case 'VHS':
			return vhsFragmentShader;
		case 'XlsczN':
			return xlsczNFragmentShader;
		case 'Water':
			return waterFragmentShader;
		case 'ChromaticAberration':
			return chromaticAberrationFragmentShader;
		case 'Glitch':
			return glitchFragmentShader;
		case 'Noise':
			return noiseFragmentShader;
		case 'Vignette':
			return vignetteFragmentShader;
		case 'Bloom':
			return bloomFragmentShader;
		case 'DepthOfField':
			return depthOfFieldFragmentShader;
		case 'Depth':
			return depthFragmentShader;
		case 'Sepia':
			return sepiaFragmentShader;
		case 'Scanline':
			return scanlineFragmentShader;
		case 'Pixelation':
			return pixelationFragmentShader;
		case 'DotScreen':
			return dotScreenFragmentShader;
		case 'HueSaturation':
			return hueSaturationFragmentShader;
		case 'BrightnessContrast':
			return brightnessContrastFragmentShader;
		case 'ColorDepth':
			return colorDepthFragmentShader;
		case 'ColorAverage':
			return colorAverageFragmentShader;
		case 'TiltShift':
			return tiltShiftFragmentShader;
		case 'ToneMapping':
			return toneMappingFragmentShader;
		case 'ASCII':
			return asciiFragmentShader;
		case 'Grid':
			return gridFragmentShader;
		case 'LensFlare':
			return lensFlareFragmentShader;
		case 'CRT':
			return crtFragmentShader;
		case 'AnamorphicBreathe':
			return anamorphicBreatheFragmentShader;
		case 'Grayscale':
			return inlineShaders.Grayscale;
		default:
			return inlineShaders.Vignette;
	}
}

