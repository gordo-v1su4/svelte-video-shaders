export const datamoshLiteFragmentShader = `
	varying vec2 v_uv;
	uniform sampler2D u_texture;
	uniform float u_time;
	uniform float u_datamosh_blocks;
	uniform float u_datamosh_offset;

	float hash(float n) { return fract(sin(n) * 43758.5453123); }

	void main() {
		float blocks = max(4.0, u_datamosh_blocks);
		vec2 cell = floor(v_uv * blocks);
		float n = hash(cell.x * 17.0 + cell.y * 31.0 + floor(u_time * 8.0));
		vec2 tear = vec2((n - 0.5) * u_datamosh_offset, 0.0);
		vec2 uv = v_uv + tear * step(0.45, n);
		vec3 base = texture2D(u_texture, clamp(uv, 0.0, 1.0)).rgb;
		vec3 shifted = vec3(
			texture2D(u_texture, clamp(uv + vec2(u_datamosh_offset * 0.35, 0.0), 0.0, 1.0)).r,
			base.g,
			texture2D(u_texture, clamp(uv - vec2(u_datamosh_offset * 0.25, 0.0), 0.0, 1.0)).b
		);
		gl_FragColor = vec4(mix(base, shifted, 0.7), 1.0);
	}
`;

export const datamoshLiteUniforms = {
	u_time: { value: 0.0 },
	u_datamosh_blocks: { value: 18.0 },
	u_datamosh_offset: { value: 0.035 }
};
