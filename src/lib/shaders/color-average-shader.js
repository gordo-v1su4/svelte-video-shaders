export const colorAverageFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Calculate average color (luminance)
        float avg = dot(color.rgb, vec3(0.333, 0.333, 0.333));
        
        // Output as grayscale
        gl_FragColor = vec4(vec3(avg), color.a);
    }
`;

export const colorAverageUniforms = {
    u_time: { value: 0.0 }
};

