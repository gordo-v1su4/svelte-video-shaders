export const xlsczNFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_audioLevel;
    uniform float u_bassLevel;
    uniform float u_midLevel;
    uniform float u_trebleLevel;
    uniform float u_intensity;
    uniform float u_colorShift;
    uniform float u_pulseSpeed;
    uniform float u_waveAmplitude;
    uniform vec2 u_resolution;

    // YIQ/RGB conversion functions from original shader
    vec3 rgb2yiq(vec3 c) {   
        return vec3(
            (0.2989*c.x + 0.5959*c.y + 0.2115*c.z),
            (0.5870*c.x - 0.2744*c.y - 0.5229*c.z),
            (0.1140*c.x - 0.3216*c.y + 0.3114*c.z)
        );
    }

    vec3 yiq2rgb(vec3 c) {				
        return vec3(
            (1.0*c.x + 1.0*c.y + 1.0*c.z),
            (0.956*c.x - 0.2720*c.y - 1.1060*c.z),
            (0.6210*c.x - 0.6474*c.y + 1.7046*c.z)
        );
    }
        
    vec2 Circle(float Start, float Points, float Point) {
        float Rad = (3.141592 * 2.0 * (1.0 / Points)) * (Point + Start);
        return vec2(-(.3+Rad), cos(Rad));
    }

    // Audio-reactive blur function adapted from original
    vec3 Blur(vec2 uv, float f, float d) {
        float t = (sin(u_time*5.0+uv.y*5.0))/10.0;
        float b = 1.0;
        t = 0.0;
        vec2 PixelOffset = vec2(d+.0005*t, 0);
        
        float Start = 2.0 / 14.0;
        vec2 Scale = 0.66 * 4.0 * 2.0 * PixelOffset.xy;
        
        vec3 N0 = texture2D(u_texture, uv + Circle(Start, 14.0, 0.0) * Scale).rgb;
        vec3 N1 = texture2D(u_texture, uv + Circle(Start, 14.0, 1.0) * Scale).rgb;
        vec3 N2 = texture2D(u_texture, uv + Circle(Start, 14.0, 2.0) * Scale).rgb;
        vec3 N3 = texture2D(u_texture, uv + Circle(Start, 14.0, 3.0) * Scale).rgb;
        vec3 N4 = texture2D(u_texture, uv + Circle(Start, 14.0, 4.0) * Scale).rgb;
        vec3 N5 = texture2D(u_texture, uv + Circle(Start, 14.0, 5.0) * Scale).rgb;
        vec3 N6 = texture2D(u_texture, uv + Circle(Start, 14.0, 6.0) * Scale).rgb;
        vec3 N7 = texture2D(u_texture, uv + Circle(Start, 14.0, 7.0) * Scale).rgb;
        vec3 N8 = texture2D(u_texture, uv + Circle(Start, 14.0, 8.0) * Scale).rgb;
        vec3 N9 = texture2D(u_texture, uv + Circle(Start, 14.0, 9.0) * Scale).rgb;
        vec3 N10 = texture2D(u_texture, uv + Circle(Start, 14.0, 10.0) * Scale).rgb;
        vec3 N11 = texture2D(u_texture, uv + Circle(Start, 14.0, 11.0) * Scale).rgb;
        vec3 N12 = texture2D(u_texture, uv + Circle(Start, 14.0, 12.0) * Scale).rgb;
        vec3 N13 = texture2D(u_texture, uv + Circle(Start, 14.0, 13.0) * Scale).rgb;
        vec3 N14 = texture2D(u_texture, uv).rgb;
        
        vec4 clr = texture2D(u_texture, uv);
        float W = 1.0 / 15.0;
        
        clr.rgb = 
            (N0 * W) +
            (N1 * W) +
            (N2 * W) +
            (N3 * W) +
            (N4 * W) +
            (N5 * W) +
            (N6 * W) +
            (N7 * W) +
            (N8 * W) +
            (N9 * W) +
            (N10 * W) +
            (N11 * W) +
            (N12 * W) +
            (N13 * W) +
            (N14 * W);
        
        return vec3(clr.xyz) * b;
    }

    void main() {
        vec2 uv = v_uv;
        
        // Start with base video texture
        vec4 baseColor = texture2D(u_texture, uv);
        
        // If no audio input, show a simple effect to verify shader is working
        if (u_audioLevel < 0.001) {
            // Simple time-based distortion to show shader is active
            float wave = sin(uv.y * 20.0 + u_time * 2.0) * 0.01 * u_intensity;
            vec2 distortedUV = uv + vec2(wave, 0.0);
            vec4 distortedColor = texture2D(u_texture, distortedUV);
            
            // Mix with original based on intensity
            gl_FragColor = mix(baseColor, distortedColor, u_intensity * 0.5);
            return;
        }
        
        // Audio-reactive distortion parameter
        float s = u_bassLevel + 0.1; // Add baseline to prevent zero
        float d = 0.1 * u_audioLevel * u_intensity;
        
        // Audio-reactive screen distortion
        float e = min(0.30, pow(max(0.0, cos(uv.y*4.0+0.3)-0.75)*(s+0.5)*1.0, 3.0)) * 25.0;
        s -= pow(u_midLevel, 1.0);
        uv.x += e * abs(s * 3.0) * u_waveAmplitude;
        
        // Audio-reactive noise displacement
        float r = u_trebleLevel * (2.0 * s);
        uv.x += abs(r * pow(min(0.003, (uv.y-0.15)) * 6.0, 2.0));
        
        d = 0.051 + abs(sin(s/4.0));
        float c = max(0.0001, 0.002 * d);
        
        // Apply audio-reactive blur with YIQ color separation
        vec3 finalColor = Blur(uv, 0.0, c + c * (uv.x));
        float y = rgb2yiq(finalColor).r;
        
        uv.x += 0.01 * d;
        c *= 6.0;
        finalColor = Blur(uv, 0.333, c);
        float i = rgb2yiq(finalColor).g;
        
        uv.x += 0.005 * d;
        c *= 2.50;
        finalColor = Blur(uv, 0.666, c);
        float q = rgb2yiq(finalColor).b;
        
        // Reconstruct color from YIQ
        finalColor = yiq2rgb(vec3(y, i, q)) - pow(s + e * 2.0, 3.0);
        finalColor *= smoothstep(1.0, 0.999, uv.x - 0.1);
        
        // Apply color shift based on audio
        finalColor = mix(finalColor, finalColor * (1.0 + u_colorShift * u_audioLevel), u_intensity);
        
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export const xlsczNUniforms = {
    u_time: { value: 0.0 },
    u_audioLevel: { value: 0.0 },
    u_bassLevel: { value: 0.0 },
    u_midLevel: { value: 0.0 },
    u_trebleLevel: { value: 0.0 },
    u_intensity: { value: 0.5 },
    u_colorShift: { value: 0.3 },
    u_pulseSpeed: { value: 2.0 },
    u_waveAmplitude: { value: 0.5 },
    u_resolution: { value: [1920, 1080] }
};
