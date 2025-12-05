export const noiseFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_opacity;
    uniform float u_premultiply;

    // Random function
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Generate noise
        float noise = random(v_uv + u_time * 0.1);
        noise = noise * 2.0 - 1.0; // Range from -1 to 1
        
        // Apply noise
        if (u_premultiply > 0.5) {
            color.rgb = color.rgb + noise * u_opacity * color.a;
        } else {
            color.rgb = color.rgb + noise * u_opacity;
        }
        
        gl_FragColor = color;
    }
`;

export const noiseUniforms = {
    u_time: { value: 0.0 },
    u_opacity: { value: 0.02 },
    u_premultiply: { value: 0.0 }
};

