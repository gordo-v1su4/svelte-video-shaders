export const kaleidoscopeFragmentShader = `
	varying vec2 v_uv;
	uniform sampler2D u_texture;
	uniform float u_time;
	uniform float u_kaleidoscope_segments;
	uniform float u_kaleidoscope_twist;

	const float PI = 3.14159265359;

	void main() {
		vec2 p = v_uv - 0.5;
		float r = length(p);
		float a = atan(p.y, p.x) + r * u_kaleidoscope_twist + u_time * 0.05;
		float seg = max(2.0, u_kaleidoscope_segments);
		float wedge = 2.0 * PI / seg;
		a = mod(a, wedge);
		a = abs(a - wedge * 0.5);
		vec2 uv = vec2(cos(a), sin(a)) * r + 0.5;
		vec4 color = texture2D(u_texture, clamp(uv, 0.0, 1.0));
		gl_FragColor = color;
	}
`;

export const kaleidoscopeUniforms = {
	u_time: { value: 0.0 },
	u_kaleidoscope_segments: { value: 6.0 },
	u_kaleidoscope_twist: { value: 1.1 }
};
