export const tiltShiftFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_tilt_offset;
    uniform float u_tilt_feather;
    uniform float u_tilt_rotation;
    uniform vec2 u_resolution;

    // Simple blur
    vec4 blur(sampler2D tex, vec2 uv, vec2 resolution, float radius) {
        vec4 color = vec4(0.0);
        float total = 0.0;
        
        for (int x = -3; x <= 3; x++) {
            for (int y = -3; y <= 3; y++) {
                float dist = length(vec2(float(x), float(y)));
                if (dist > radius) continue;
                
                float weight = 1.0 / (1.0 + dist * dist);
                vec2 offset = vec2(float(x), float(y)) / resolution;
                color += texture2D(tex, uv + offset) * weight;
                total += weight;
            }
        }
        
        return color / total;
    }

    void main() {
        vec2 uv = v_uv;
        
        // Rotate UV coordinates
        float s = sin(u_tilt_rotation);
        float c = cos(u_tilt_rotation);
        vec2 center = vec2(0.5, 0.5);
        vec2 rotatedUV = vec2(
            c * (uv.x - center.x) + s * (uv.y - center.y) + center.x,
            -s * (uv.x - center.x) + c * (uv.y - center.y) + center.y
        );
        
        // Calculate distance from center line
        float distFromCenter = abs(rotatedUV.y - center.y);
        
        // Calculate blur amount based on distance
        float blurAmount = smoothstep(u_tilt_offset, u_tilt_offset + u_tilt_feather, distFromCenter);
        
        // Sample original and blurred
        vec4 original = texture2D(u_texture, uv);
        vec4 blurred = blur(u_texture, uv, u_resolution, blurAmount * 10.0);
        
        // Mix based on blur amount
        vec4 color = mix(original, blurred, blurAmount);
        
        gl_FragColor = color;
    }
`;

export const tiltShiftUniforms = {
    u_time: { value: 0.0 },
    u_tilt_offset: { value: 0.3 },
    u_tilt_feather: { value: 0.2 },
    u_tilt_rotation: { value: 0.0 },
    u_resolution: { value: [1920, 1080] }
};

