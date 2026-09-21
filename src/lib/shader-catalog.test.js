import { describe, expect, it } from 'vitest';
import { shaderCatalog, filterShaders, getSmartShaderSuggestions } from './shader-catalog.js';

const categories = new Set([
	'Featured',
	'Analog/Retro',
	'Color',
	'Distortion',
	'Texture',
	'Cinematic',
	'Audio Reactive',
	'Utility/Technical'
]);

describe('shader catalog', () => {
	it('has complete unique metadata for every shader', () => {
		const ids = new Set();
		for (const shader of shaderCatalog) {
			expect(shader.id).toBeTruthy();
			expect(ids.has(shader.id)).toBe(false);
			ids.add(shader.id);
			expect(shader.label).toBeTruthy();
			expect(categories.has(shader.category)).toBe(true);
			expect(shader.description.length).toBeGreaterThan(10);
			expect(shader.tags.length).toBeGreaterThan(0);
			expect(shader.fragmentShader).toContain('gl_FragColor');
			expect(shader.defaultUniforms).toBeTruthy();
			expect(shader.presets.length).toBeGreaterThan(0);
			expect(['low', 'medium', 'high']).toContain(shader.performance);
		}
	});

	it('preset and control uniforms exist in defaults', () => {
		for (const shader of shaderCatalog) {
			const defaults = new Set(Object.keys(shader.defaultUniforms));
			for (const control of shader.controls) expect(defaults.has(control.key)).toBe(true);
			for (const preset of shader.presets) {
				for (const key of Object.keys(preset.values || {})) expect(defaults.has(key)).toBe(true);
			}
		}
	});

	it('supports searching and smart suggestions', () => {
		expect(filterShaders({ search: 'grain' }).some((shader) => shader.id === 'FilmGrain')).toBe(
			true
		);
		expect(getSmartShaderSuggestions({ hasAudio: true, bpm: 140 }).length).toBeGreaterThan(0);
	});
});
