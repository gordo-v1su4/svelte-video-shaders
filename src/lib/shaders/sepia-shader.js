export const sepiaFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_sepia_intensity;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Sepia tone matrix
        float r = dot(color.rgb, vec3(0.393, 0.769, 0.189));
        float g = dot(color.rgb, vec3(0.349, 0.686, 0.168));
        float b = dot(color.rgb, vec3(0.272, 0.534, 0.131));
        
        vec3 sepiaColor = vec3(r, g, b);
        color.rgb = mix(color.rgb, sepiaColor, u_sepia_intensity);
        
        gl_FragColor = color;
    }
`;

export const sepiaUniforms = {
    u_time: { value: 0.0 },
    u_sepia_intensity: { value: 1.0 }
};

