export const chromaticAberrationFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform vec2 u_offset;
    uniform float u_radialModulation;
    uniform float u_modulationOffset;

    void main() {
        vec2 uv = v_uv;
        vec2 offset = u_offset;
        
        // Radial modulation - offset increases from center
        if (u_radialModulation > 0.5) {
            vec2 center = vec2(0.5, 0.5);
            vec2 dist = uv - center;
            float radius = length(dist);
            offset *= (1.0 + radius * u_modulationOffset);
        }
        
        // Sample RGB channels with offset (clamp UV to prevent sampling outside texture)
        vec2 uvR = clamp(uv + offset, 0.0, 1.0);
        vec2 uvB = clamp(uv - offset, 0.0, 1.0);
        
        float r = texture2D(u_texture, uvR).r;
        float g = texture2D(u_texture, uv).g;
        float b = texture2D(u_texture, uvB).b;
        
        gl_FragColor = vec4(r, g, b, 1.0);
    }
`;

export const chromaticAberrationUniforms = {
    u_time: { value: 0.0 },
    u_offset: { value: [0.002, 0.002] },
    u_radialModulation: { value: 0.0 },
    u_modulationOffset: { value: 0.15 }
};

