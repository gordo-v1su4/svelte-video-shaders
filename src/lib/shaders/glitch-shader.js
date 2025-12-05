export const glitchFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_glitch_strength;
    uniform float u_columns;
    uniform float u_ratio;
    uniform float u_duration;
    uniform float u_delay;

    // Random function
    float random(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    // Blocky glitch effect
    float blockGlitch(vec2 uv) {
        float block = floor(uv.y * u_columns);
        float noise = random(vec2(block, floor(u_time * 10.0)));
        return noise;
    }

    void main() {
        vec2 uv = v_uv;
        
        // Calculate glitch timing
        float glitchTime = mod(u_time, u_delay + u_duration);
        float glitchActive = step(u_delay, glitchTime) * step(glitchTime, u_delay + u_duration);
        
        // Column displacement
        float block = blockGlitch(uv);
        float displacement = (block - 0.5) * u_glitch_strength * glitchActive;
        
        // RGB shift
        vec2 offset = vec2(displacement * u_ratio, 0.0);
        float r = texture2D(u_texture, uv + offset).r;
        float g = texture2D(u_texture, uv).g;
        float b = texture2D(u_texture, uv - offset).b;
        
        // Random line glitches
        float lineGlitch = step(0.98, random(vec2(floor(uv.y * 200.0), floor(u_time * 20.0))));
        vec2 glitchUV = uv + vec2((random(vec2(uv.y, u_time)) - 0.5) * u_glitch_strength * 0.1 * lineGlitch * glitchActive, 0.0);
        
        vec4 color = texture2D(u_texture, glitchUV);
        color.rgb = mix(color.rgb, vec3(r, g, b), glitchActive);
        
        // Digital noise overlay
        float noise = random(uv + u_time) * 0.1 * glitchActive;
        color.rgb += noise;
        
        gl_FragColor = color;
    }
`;

export const glitchUniforms = {
    u_time: { value: 0.0 },
    u_glitch_strength: { value: 0.5 },
    u_columns: { value: 20.0 },
    u_ratio: { value: 0.5 },
    u_duration: { value: 0.6 },
    u_delay: { value: 1.5 }
};

