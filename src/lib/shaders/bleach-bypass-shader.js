export const bleachBypassFragmentShader = `
	varying vec2 v_uv;
	uniform sampler2D u_texture;
	uniform float u_bleach_amount;
	uniform float u_bleach_contrast;

	void main() {
		vec4 color = texture2D(u_texture, v_uv);
		float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
		vec3 highContrast = mix(vec3(luma), color.rgb, 0.45 + u_bleach_contrast);
		vec3 crushed = (highContrast - 0.5) * (1.0 + u_bleach_contrast * 1.4) + 0.5;
		vec3 result = mix(color.rgb, crushed, u_bleach_amount);
		gl_FragColor = vec4(clamp(result, 0.0, 1.0), color.a);
	}
`;

export const bleachBypassUniforms = {
	u_bleach_amount: { value: 0.65 },
	u_bleach_contrast: { value: 0.35 }
};
