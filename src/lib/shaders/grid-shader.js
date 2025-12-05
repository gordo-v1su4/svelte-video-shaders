export const gridFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_grid_scale;
    uniform float u_grid_lineWidth;

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Create grid pattern (WebGL 1.0 compatible)
        vec2 gridUV = v_uv * u_grid_scale;
        vec2 grid = abs(fract(gridUV - 0.5) - 0.5);
        float gridLine = min(grid.x, grid.y);
        
        // Create grid lines with adjustable width
        float lineWidth = u_grid_lineWidth * 0.1;
        float line = smoothstep(lineWidth, lineWidth + 0.05, gridLine);
        
        // Apply grid overlay
        color.rgb *= mix(0.7, 1.0, line);
        
        gl_FragColor = color;
    }
`;

export const gridUniforms = {
    u_time: { value: 0.0 },
    u_grid_scale: { value: 1.0 },
    u_grid_lineWidth: { value: 0.0 }
};

