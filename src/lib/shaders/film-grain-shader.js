export const filmGrainFragmentShader = `
	varying vec2 v_uv;
	uniform sampler2D u_texture;
	uniform float u_time;
	uniform float u_film_grain_amount;
	uniform float u_halation;

	float hash(vec2 p) {
		p = fract(p * vec2(123.34, 456.21));
		p += dot(p, p + 45.32);
		return fract(p.x * p.y);
	}

	void main() {
		vec4 color = texture2D(u_texture, v_uv);
		float grain = hash(v_uv * 1280.0 + u_time * 24.0) - 0.5;
		vec3 warm = vec3(1.0, 0.64, 0.34) * smoothstep(0.45, 1.0, color.r) * u_halation;
		vec3 graded = color.rgb + grain * u_film_grain_amount + warm * 0.18;
		gl_FragColor = vec4(clamp(graded, 0.0, 1.0), color.a);
	}
`;

export const filmGrainUniforms = {
	u_time: { value: 0.0 },
	u_film_grain_amount: { value: 0.08 },
	u_halation: { value: 0.35 }
};
