export function createDefaultUniforms() {
	return {
		// VHS shader uniforms
		u_time: { value: 0.0 },
		u_rgbShift: { value: 0.0015 },
		u_noise: { value: 0.0 },
		u_flickerIntensity: { value: 0.5 },
		u_trackingIntensity: { value: 0.1 },
		u_trackingSpeed: { value: 1.2 },
		u_trackingFreq: { value: 8.0 },

		// Existing shader uniforms (Grayscale)
		u_strength: { value: 0.5 },
		// Old Vignette shader uniforms (kept for compatibility)
		u_vignette_strength: { value: 0.5 },
		u_vignette_falloff: { value: 0.3 },

		// XlsczN audio-reactive uniforms
		u_audioLevel: { value: 0.0 },
		u_bassLevel: { value: 0.0 },
		u_midLevel: { value: 0.0 },
		u_trebleLevel: { value: 0.0 },
		u_intensity: { value: 0.5 },
		u_colorShift: { value: 0.3 },
		u_pulseSpeed: { value: 2.0 },
		// Shared key across shader families; keep the current runtime default.
		u_waveAmplitude: { value: 0.5 },
		u_resolution: { value: [1280, 720] },

		// Water shader uniforms
		u_factor: { value: 0.5 },

		// Chromatic Aberration uniforms
		u_offset: { value: [0.002, 0.002] },
		u_radialModulation: { value: 0.0 },
		u_modulationOffset: { value: 0.15 },

		// Glitch uniforms
		u_glitch_strength: { value: 0.5 },
		u_columns: { value: 20.0 },
		u_ratio: { value: 0.5 },
		u_duration: { value: 0.6 },
		u_delay: { value: 1.5 },

		// Noise uniforms
		u_opacity: { value: 0.02 },
		u_premultiply: { value: 0.0 },

		// Vignette (new) uniforms
		u_offset_vignette: { value: 0.5 },
		u_darkness: { value: 0.5 },
		u_eskil: { value: 0.0 },

		// Bloom uniforms
		u_intensity_bloom: { value: 1.0 },
		u_luminanceThreshold: { value: 0.9 },
		u_luminanceSmoothing: { value: 0.025 },

		// Depth of Field uniforms
		u_focusDistance: { value: 0.3 },
		u_focusRange: { value: 0.5 },
		u_bokehScale: { value: 2.0 },
		u_focusPoint: { value: [0.5, 0.5] },

		// Depth visualization uniforms
		u_near: { value: 0.0 },
		u_far: { value: 1.0 },
		u_inverted: { value: 0.0 },

		// Sepia uniforms
		u_sepia_intensity: { value: 1.0 },

		// Scanline uniforms
		u_scanline_density: { value: 1.25 },
		u_scanline_intensity: { value: 0.3 },
		u_scanline_width: { value: 2.0 },
		u_scanline_speed: { value: 0.0 },
		u_scanline_offset: { value: 0.0 },

		// Pixelation uniforms
		u_granularity: { value: 20.0 },

		// Dot Screen uniforms
		u_dot_angle: { value: 1.57 },
		u_dot_scale: { value: 1.0 },

		// Hue Saturation uniforms
		u_hue: { value: 0.0 },
		u_saturation: { value: 0.0 },

		// Brightness Contrast uniforms
		u_brightness: { value: 0.0 },
		u_contrast: { value: 0.0 },

		// Color Depth uniforms
		u_bits: { value: 16.0 },

		// Tilt Shift uniforms
		u_tilt_offset: { value: 0.3 },
		u_tilt_feather: { value: 0.2 },
		u_tilt_rotation: { value: 0.0 },

		// Tone Mapping uniforms
		u_exposure: { value: 1.0 },
		u_maxLuminance: { value: 16.0 },
		u_middleGrey: { value: 0.6 },

		// ASCII uniforms
		u_charSize: { value: 8.0 },

		// Grid uniforms
		u_grid_scale: { value: 1.0 },
		u_grid_lineWidth: { value: 0.0 },

		// Lens Flare uniforms
		u_flareBrightness: { value: 1.0 },
		u_flareSize: { value: 0.005 },
		u_flareSpeed: { value: 0.4 },
		u_flareShape: { value: 0.1 },
		u_ghostScale: { value: 0.1 },
		u_haloScale: { value: 0.5 },
		u_starBurst: { value: 1.0 },
		u_sunPosition: { value: [0.5, 0.5, -1.0] },
		u_anamorphic: { value: 0.0 },
		u_colorGain: { value: [1.0, 0.8, 0.6] },
		u_secondaryGhosts: { value: 1.0 },
		u_additionalStreaks: { value: 1.0 },

		// CRT uniforms
		u_pixelSize: { value: 5.0 },
		// Shared key across shader families; keep the current runtime default.
		u_distortion: { value: 0.3 },
		u_blur: { value: 0.3 },
		u_aberration: { value: 0.05 },
		// Shared key across shader families; keep the current runtime default.
		u_scanlineIntensity: { value: 0.05 },
		u_scanlineSpeed: { value: 100.0 },
		u_gridIntensity: { value: 0.1 },
		u_vignetteIntensity: { value: 1.0 },
		u_dither: { value: 0.1 },

		// Anamorphic Breathe uniforms
		u_chromatic_enable: { value: 1.0 },
		u_chromatic_amount: { value: 0.5 },
		u_chromatic_speed: { value: 0.8 },
		u_chromatic_style: { value: 1.0 },
		u_defocus_enable: { value: 1.0 },
		u_defocus_amount: { value: 0.4 },
		u_defocus_speed: { value: 0.5 },
		u_anamorphic_ratio: { value: 1.5 },
		u_breathe_intensity: { value: 1.0 },
		u_breathe_sync: { value: 1.0 }
	};
}
