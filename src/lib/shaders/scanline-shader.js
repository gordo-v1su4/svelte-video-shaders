export const scanlineFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_scanline_density;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Create scanline pattern
        float scanline = sin(v_uv.y * u_scanline_density * 3.14159 * 2.0) * 0.5 + 0.5;
        scanline = pow(scanline, 2.0);
        
        // Apply scanline overlay
        color.rgb *= mix(1.0, scanline, 0.3);
        
        gl_FragColor = color;
    }
`;

export const scanlineUniforms = {
    u_time: { value: 0.0 },
    u_scanline_density: { value: 1.25 }
};

