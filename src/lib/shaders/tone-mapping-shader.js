export const toneMappingFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_exposure;
    uniform float u_maxLuminance;
    uniform float u_middleGrey;

    // Reinhard tone mapping
    vec3 reinhard(vec3 color) {
        return color / (1.0 + color);
    }

    // ACES tone mapping approximation
    vec3 aces(vec3 color) {
        color *= u_exposure;
        float a = 2.51;
        float b = 0.03;
        float c = 2.43;
        float d = 0.59;
        float e = 0.14;
        return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
    }

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Apply exposure
        color.rgb *= u_exposure;
        
        // Apply tone mapping (Reinhard)
        color.rgb = reinhard(color.rgb);
        
        // Adjust middle grey
        color.rgb *= u_middleGrey;
        
        // Clamp to max luminance
        color.rgb = min(color.rgb, vec3(u_maxLuminance));
        
        gl_FragColor = color;
    }
`;

export const toneMappingUniforms = {
    u_time: { value: 0.0 },
    u_exposure: { value: 1.0 },
    u_maxLuminance: { value: 16.0 },
    u_middleGrey: { value: 0.6 }
};

