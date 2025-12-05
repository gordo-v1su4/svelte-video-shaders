export const hueSaturationFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_hue;
    uniform float u_saturation;

    // RGB to HSV conversion
    vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    // HSV to RGB conversion
    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        vec3 hsv = rgb2hsv(color.rgb);
        
        // Adjust hue and saturation
        hsv.x = mod(hsv.x + u_hue, 1.0);
        hsv.y = clamp(hsv.y + u_saturation, 0.0, 1.0);
        
        color.rgb = hsv2rgb(hsv);
        gl_FragColor = color;
    }
`;

export const hueSaturationUniforms = {
    u_time: { value: 0.0 },
    u_hue: { value: 0.0 },
    u_saturation: { value: 0.0 }
};

