export const bloomFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_intensity_bloom;
    uniform float u_luminanceThreshold;
    uniform float u_luminanceSmoothing;
    uniform vec2 u_resolution;

    // Simple blur function
    vec4 blur(sampler2D tex, vec2 uv, vec2 resolution, float radius) {
        vec4 color = vec4(0.0);
        float total = 0.0;
        
        for (int x = -2; x <= 2; x++) {
            for (int y = -2; y <= 2; y++) {
                vec2 offset = vec2(float(x), float(y)) * radius / resolution;
                vec4 sample = texture2D(tex, uv + offset);
                float weight = 1.0 / (1.0 + float(x*x + y*y));
                color += sample * weight;
                total += weight;
            }
        }
        
        return color / total;
    }

    // Calculate luminance
    float luminance(vec3 color) {
        return dot(color, vec3(0.299, 0.587, 0.114));
    }

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        float lum = luminance(color.rgb);
        
        // Extract bright areas
        float bright = smoothstep(u_luminanceThreshold, u_luminanceThreshold + u_luminanceSmoothing, lum);
        
        // Blur the bright areas
        vec4 bloom = blur(u_texture, v_uv, u_resolution, 2.0);
        bloom.rgb *= bright;
        
        // Combine original with bloom
        color.rgb += bloom.rgb * u_intensity_bloom;
        
        // Clamp to prevent overflow
        gl_FragColor = clamp(color, 0.0, 1.0);
    }
`;

export const bloomUniforms = {
    u_time: { value: 0.0 },
    u_intensity_bloom: { value: 1.0 },
    u_luminanceThreshold: { value: 0.9 },
    u_luminanceSmoothing: { value: 0.025 },
    u_resolution: { value: [1920, 1080] }
};

