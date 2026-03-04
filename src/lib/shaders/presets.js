export function applyVHSPreset(uniforms, preset) {
	switch (preset) {
		case 'classic':
			uniforms.u_distortion.value = 0.075;
			uniforms.u_scanlineIntensity.value = 0.26;
			uniforms.u_rgbShift.value = 0.0015;
			uniforms.u_noise.value = 0.022;
			uniforms.u_flickerIntensity.value = 0.5;
			uniforms.u_trackingIntensity.value = 0.1;
			uniforms.u_trackingSpeed.value = 1.2;
			uniforms.u_trackingFreq.value = 8.0;
			uniforms.u_waveAmplitude.value = 0.1;
			break;
		case 'damaged':
			uniforms.u_distortion.value = 0.15;
			uniforms.u_scanlineIntensity.value = 0.4;
			uniforms.u_rgbShift.value = 0.005;
			uniforms.u_noise.value = 0.08;
			uniforms.u_flickerIntensity.value = 1.2;
			uniforms.u_trackingIntensity.value = 0.3;
			uniforms.u_trackingSpeed.value = 2.0;
			uniforms.u_trackingFreq.value = 12.0;
			uniforms.u_waveAmplitude.value = 0.3;
			break;
		case 'clean':
			uniforms.u_distortion.value = 0.02;
			uniforms.u_scanlineIntensity.value = 0.1;
			uniforms.u_rgbShift.value = 0.0005;
			uniforms.u_noise.value = 0.005;
			uniforms.u_flickerIntensity.value = 0.1;
			uniforms.u_trackingIntensity.value = 0.02;
			uniforms.u_trackingSpeed.value = 0.5;
			uniforms.u_trackingFreq.value = 4.0;
			uniforms.u_waveAmplitude.value = 0.02;
			break;
		case 'heavy':
			uniforms.u_distortion.value = 0.3;
			uniforms.u_scanlineIntensity.value = 0.6;
			uniforms.u_rgbShift.value = 0.01;
			uniforms.u_noise.value = 0.15;
			uniforms.u_flickerIntensity.value = 1.8;
			uniforms.u_trackingIntensity.value = 0.5;
			uniforms.u_trackingSpeed.value = 3.0;
			uniforms.u_trackingFreq.value = 20.0;
			uniforms.u_waveAmplitude.value = 0.5;
			break;
	}
}

export function applyAnamorphicPreset(uniforms, preset) {
	switch (preset) {
		case 'subtle':
			uniforms.u_chromatic_amount.value = 0.2;
			uniforms.u_chromatic_speed.value = 0.5;
			uniforms.u_defocus_amount.value = 0.15;
			uniforms.u_defocus_speed.value = 0.3;
			uniforms.u_anamorphic_ratio.value = 1.3;
			uniforms.u_breathe_intensity.value = 0.6;
			return { chromaticEnabled: true, defocusEnabled: true, chromaticStyle: 1, breatheSync: true };
		case 'dreamy':
			uniforms.u_chromatic_amount.value = 0.5;
			uniforms.u_chromatic_speed.value = 0.6;
			uniforms.u_defocus_amount.value = 0.5;
			uniforms.u_defocus_speed.value = 0.4;
			uniforms.u_anamorphic_ratio.value = 1.5;
			uniforms.u_breathe_intensity.value = 1.0;
			return { chromaticEnabled: true, defocusEnabled: true, chromaticStyle: 1, breatheSync: true };
		case 'trippy':
			uniforms.u_chromatic_amount.value = 1.2;
			uniforms.u_chromatic_speed.value = 1.5;
			uniforms.u_defocus_amount.value = 0.3;
			uniforms.u_defocus_speed.value = 0.8;
			uniforms.u_anamorphic_ratio.value = 1.8;
			uniforms.u_breathe_intensity.value = 1.5;
			return { chromaticEnabled: true, defocusEnabled: true, chromaticStyle: 0, breatheSync: false };
		case 'cinematic':
			uniforms.u_chromatic_amount.value = 0.3;
			uniforms.u_chromatic_speed.value = 0.4;
			uniforms.u_defocus_amount.value = 0.7;
			uniforms.u_defocus_speed.value = 0.25;
			uniforms.u_anamorphic_ratio.value = 2.0;
			uniforms.u_breathe_intensity.value = 0.8;
			return { chromaticEnabled: true, defocusEnabled: true, chromaticStyle: 1, breatheSync: true };
		default:
			return null;
	}
}

