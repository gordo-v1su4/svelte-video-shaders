export const pixelationFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_granularity;
    uniform vec2 u_resolution;

    void main() {
        // Calculate pixel size
        vec2 pixelSize = vec2(1.0) / u_resolution;
        vec2 pixelatedUV = floor(v_uv / (pixelSize * u_granularity)) * (pixelSize * u_granularity);
        
        vec4 color = texture2D(u_texture, pixelatedUV);
        gl_FragColor = color;
    }
`;

export const pixelationUniforms = {
    u_time: { value: 0.0 },
    u_granularity: { value: 20.0 },
    u_resolution: { value: [1920, 1080] }
};

