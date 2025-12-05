export const brightnessContrastFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_brightness;
    uniform float u_contrast;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Apply brightness
        color.rgb += u_brightness;
        
        // Apply contrast
        color.rgb = (color.rgb - 0.5) * (1.0 + u_contrast) + 0.5;
        
        // Clamp to valid range
        color.rgb = clamp(color.rgb, 0.0, 1.0);
        
        gl_FragColor = color;
    }
`;

export const brightnessContrastUniforms = {
    u_time: { value: 0.0 },
    u_brightness: { value: 0.0 },
    u_contrast: { value: 0.0 }
};

