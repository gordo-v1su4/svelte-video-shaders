export const depthFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_near;
    uniform float u_far;
    uniform float u_inverted;

    // Calculate depth from luminance (simulated depth for 2D video)
    float calculateDepth(vec4 color) {
        // Use luminance as depth indicator
        float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        
        // Invert if needed (bright = far, dark = near, or vice versa)
        if (u_inverted > 0.5) {
            luminance = 1.0 - luminance;
        }
        
        // Map to near/far range
        return mix(u_near, u_far, luminance);
    }

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Calculate depth value
        float depth = calculateDepth(color);
        
        // Normalize depth to 0-1 range for visualization
        float depthRange = u_far - u_near;
        float normalizedDepth = depthRange > 0.001 ? (depth - u_near) / depthRange : 0.0;
        
        // Output as grayscale depth map
        gl_FragColor = vec4(vec3(normalizedDepth), color.a);
    }
`;

export const depthUniforms = {
    u_time: { value: 0.0 },
    u_near: { value: 0.0 },
    u_far: { value: 1.0 },
    u_inverted: { value: 0.0 }
};

