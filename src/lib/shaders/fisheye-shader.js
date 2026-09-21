export const fisheyeFragmentShader = `
	varying vec2 v_uv;
	uniform sampler2D u_texture;
	uniform float u_fisheye_strength;
	uniform float u_lens_zoom;

	void main() {
		vec2 centered = (v_uv - 0.5) * 2.0;
		float radius = length(centered);
		float theta = atan(centered.y, centered.x);
		float distorted = pow(radius, 1.0 + u_fisheye_strength * 1.5) / max(0.35, u_lens_zoom);
		vec2 uv = vec2(cos(theta), sin(theta)) * distorted * 0.5 + 0.5;
		vec4 color = texture2D(u_texture, clamp(uv, 0.0, 1.0));
		float vignette = smoothstep(1.15, 0.55, radius);
		gl_FragColor = vec4(color.rgb * vignette, color.a);
	}
`;

export const fisheyeUniforms = {
	u_fisheye_strength: { value: 0.35 },
	u_lens_zoom: { value: 1.0 }
};
