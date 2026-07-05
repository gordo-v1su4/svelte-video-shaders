export const duotoneFragmentShader = `
	varying vec2 v_uv;
	uniform sampler2D u_texture;
	uniform float u_duotone_mix;
	uniform vec3 u_duotone_dark;
	uniform vec3 u_duotone_light;

	void main() {
		vec4 color = texture2D(u_texture, v_uv);
		float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
		vec3 duo = mix(u_duotone_dark, u_duotone_light, smoothstep(0.05, 0.95, luma));
		gl_FragColor = vec4(mix(color.rgb, duo, u_duotone_mix), color.a);
	}
`;

export const duotoneUniforms = {
	u_duotone_mix: { value: 0.75 },
	u_duotone_dark: { value: [0.04, 0.02, 0.16] },
	u_duotone_light: { value: [1.0, 0.36, 0.82] }
};
