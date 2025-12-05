export const depthOfFieldFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_focusDistance;
    uniform float u_focusRange;
    uniform float u_bokehScale;
    uniform vec2 u_resolution;
    uniform vec2 u_focusPoint;

    // Simple gaussian blur
    vec4 gaussianBlur(sampler2D tex, vec2 uv, vec2 resolution, float radius) {
        vec4 color = vec4(0.0);
        float total = 0.0;
        
        int samples = int(radius * 2.0) + 1;
        float sigma = radius / 3.0;
        
        for (int x = -5; x <= 5; x++) {
            for (int y = -5; y <= 5; y++) {
                float dist = length(vec2(float(x), float(y)));
                if (dist > radius) continue;
                
                float weight = exp(-(dist * dist) / (2.0 * sigma * sigma));
                vec2 offset = vec2(float(x), float(y)) / resolution;
                color += texture2D(tex, uv + offset) * weight;
                total += weight;
            }
        }
        
        return color / total;
    }

    void main() {
        vec2 uv = v_uv;
        
        // Calculate distance from focus point
        vec2 focusPoint = u_focusPoint;
        float distFromFocus = distance(uv, focusPoint);
        
        // Calculate blur amount based on distance from focus
        float blurAmount = 0.0;
        if (distFromFocus > u_focusDistance) {
            float outsideFocus = distFromFocus - u_focusDistance;
            blurAmount = smoothstep(0.0, u_focusRange, outsideFocus) * u_bokehScale;
        }
        
        // Sample original texture
        vec4 color = texture2D(u_texture, uv);
        
        // Apply blur if needed
        if (blurAmount > 0.01) {
            vec4 blurred = gaussianBlur(u_texture, uv, u_resolution, blurAmount * 10.0);
            color = mix(color, blurred, blurAmount);
        }
        
        gl_FragColor = color;
    }
`;

export const depthOfFieldUniforms = {
    u_time: { value: 0.0 },
    u_focusDistance: { value: 0.3 },
    u_focusRange: { value: 0.5 },
    u_bokehScale: { value: 2.0 },
    u_resolution: { value: [1920, 1080] },
    u_focusPoint: { value: [0.5, 0.5] }
};

