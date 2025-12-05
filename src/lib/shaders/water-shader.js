export const waterFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_factor;

    void main() {
        vec2 uv = v_uv;
        float frequency = 6.0 * u_factor;
        float amplitude = 0.015 * u_factor;
        float x = uv.y * frequency + u_time * 0.7; 
        float y = uv.x * frequency + u_time * 0.3;
        uv.x += cos(x + y) * amplitude * cos(y);
        uv.y += sin(x - y) * amplitude * cos(y);
        
        vec4 rgba = texture2D(u_texture, uv);
        gl_FragColor = rgba;
    }
`;

export const waterUniforms = {
    u_time: { value: 0.0 },
    u_factor: { value: 0.5 }
};

