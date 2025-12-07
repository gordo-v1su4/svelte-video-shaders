export const scanlineFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_scanline_density;
    uniform float u_scanline_intensity;
    uniform float u_scanline_width;
    uniform float u_scanline_speed;
    uniform float u_scanline_offset;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Create animated scanline pattern
        float y = v_uv.y + u_time * u_scanline_speed + u_scanline_offset;
        float scanline = sin(y * u_scanline_density * 3.14159 * 2.0) * 0.5 + 0.5;
        
        // Control scanline width/sharpness
        scanline = pow(scanline, u_scanline_width);
        
        // Apply scanline overlay with intensity control
        color.rgb *= mix(1.0, scanline, u_scanline_intensity);
        
        gl_FragColor = color;
    }
`;

export const scanlineUniforms = {
    u_time: { value: 0.0 },
    u_scanline_density: { value: 1.25 },
    u_scanline_intensity: { value: 0.3 },
    u_scanline_width: { value: 2.0 },
    u_scanline_speed: { value: 0.0 },
    u_scanline_offset: { value: 0.0 }
};

