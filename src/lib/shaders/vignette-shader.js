export const vignetteFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_offset_vignette;
    uniform float u_darkness;
    uniform float u_eskil;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        vec2 uv = v_uv;
        
        float vignette;
        
        if (u_eskil > 0.5) {
            // Eskil's vignette technique
            vec2 coord = (uv - 0.5) * (1.0 - u_offset_vignette);
            float dist = length(coord);
            vignette = smoothstep(0.8, 0.0, dist);
        } else {
            // Standard vignette
            vec2 center = vec2(0.5, 0.5);
            float dist = distance(uv, center);
            vignette = 1.0 - smoothstep(u_offset_vignette, 1.0, dist);
        }
        
        color.rgb *= mix(1.0, vignette, u_darkness);
        
        gl_FragColor = color;
    }
`;

export const vignetteUniforms = {
    u_time: { value: 0.0 },
    u_offset_vignette: { value: 0.5 },
    u_darkness: { value: 0.5 },
    u_eskil: { value: 0.0 }
};

