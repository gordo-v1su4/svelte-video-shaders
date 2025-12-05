export const colorDepthFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_bits;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Calculate quantization levels
        float levels = pow(2.0, u_bits);
        
        // Quantize color
        color.rgb = floor(color.rgb * levels) / levels;
        
        gl_FragColor = color;
    }
`;

export const colorDepthUniforms = {
    u_time: { value: 0.0 },
    u_bits: { value: 16.0 }
};

