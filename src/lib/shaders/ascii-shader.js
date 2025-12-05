export const asciiFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_charSize;
    uniform vec2 u_resolution;

    // ASCII character set (simplified)
    float character(float n, vec2 p) {
        p = floor(p * vec2(4.0, 6.0) + 0.5);
        if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 6.0) == p.y) {
            // Simplified character rendering
            return step(0.5, mod(n, 2.0));
        }
        return 0.0;
    }

    void main() {
        vec2 uv = v_uv;
        
        // Calculate character grid position
        vec2 charUV = floor(uv * u_resolution / u_charSize);
        vec2 pixelUV = mod(uv * u_resolution, u_charSize) / u_charSize;
        
        // Sample texture at character center
        vec2 sampleUV = (charUV + 0.5) * u_charSize / u_resolution;
        vec4 color = texture2D(u_texture, sampleUV);
        
        // Convert to grayscale
        float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        
        // Map to character index
        float charIndex = floor(gray * 10.0);
        
        // Render character
        float char = character(charIndex, pixelUV);
        
        gl_FragColor = vec4(vec3(char), 1.0);
    }
`;

export const asciiUniforms = {
    u_time: { value: 0.0 },
    u_charSize: { value: 8.0 },
    u_resolution: { value: [1920, 1080] }
};

