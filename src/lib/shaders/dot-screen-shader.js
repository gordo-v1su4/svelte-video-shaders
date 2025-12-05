export const dotScreenFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_dot_angle;
    uniform float u_dot_scale;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Rotate UV coordinates
        float s = sin(u_dot_angle);
        float c = cos(u_dot_angle);
        vec2 rotatedUV = vec2(
            c * (v_uv.x - 0.5) + s * (v_uv.y - 0.5) + 0.5,
            -s * (v_uv.x - 0.5) + c * (v_uv.y - 0.5) + 0.5
        );
        
        // Create dot pattern
        vec2 pattern = rotatedUV * u_dot_scale;
        float dots = sin(pattern.x * 3.14159) * sin(pattern.y * 3.14159);
        dots = step(0.0, dots);
        
        // Apply dot screen effect
        color.rgb *= mix(0.5, 1.0, dots);
        
        gl_FragColor = color;
    }
`;

export const dotScreenUniforms = {
    u_time: { value: 0.0 },
    u_dot_angle: { value: 1.57 },
    u_dot_scale: { value: 1.0 }
};

