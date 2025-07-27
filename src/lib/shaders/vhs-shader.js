export const vhsFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_distortion;
    uniform float u_scanlineIntensity;
    uniform float u_rgbShift;
    uniform float u_noise;
    uniform float u_flickerIntensity;
    uniform float u_trackingIntensity;
    uniform float u_trackingSpeed;
    uniform float u_trackingFreq;
    uniform float u_waveAmplitude;

    #define PI 3.14159265

    // Hash function for noise
    float hash(vec2 v) {
        return fract(sin(dot(v, vec2(89.44, 19.36))) * 22189.22);
    }

    // Interpolated hash for smoother noise
    float iHash(vec2 v, vec2 r) {
        float h00 = hash(floor(v * r + vec2(0.0, 0.0)) / r);
        float h10 = hash(floor(v * r + vec2(1.0, 0.0)) / r);
        float h01 = hash(floor(v * r + vec2(0.0, 1.0)) / r);
        float h11 = hash(floor(v * r + vec2(1.0, 1.0)) / r);
        vec2 ip = smoothstep(vec2(0.0), vec2(1.0), mod(v * r, 1.0));
        return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y) + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
    }

    // Multi-octave noise
    float vhsNoise(vec2 v) {
        float sum = 0.0;
        for(int i = 1; i < 5; i++) {
            sum += iHash(v + vec2(float(i)), vec2(2.0 * pow(2.0, float(i)))) / pow(2.0, float(i));
        }
        return sum;
    }

    // Simple random for basic effects
    float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
        vec2 uv = v_uv;
        vec2 uvn = uv;

        // Apply barrel distortion
        vec2 cc = uv - 0.5;
        float dist = dot(cc, cc) * u_distortion;
        uv = uv + cc * (1.0 + dist) * dist;
        uvn = uv;

        // VHS Tape Wave
        if (u_waveAmplitude > 0.0) {
            uvn.x += (vhsNoise(vec2(uvn.y, u_time)) - 0.5) * 0.005 * u_waveAmplitude * 10.0;
            uvn.x += (vhsNoise(vec2(uvn.y * 100.0, u_time * 10.0)) - 0.5) * 0.01 * u_waveAmplitude * 10.0;
        }

        // VHS Tracking
        if (u_trackingIntensity > 0.0) {
            float tcPhase = clamp((sin(uvn.y * u_trackingFreq - u_time * PI * u_trackingSpeed) - 0.92) * vhsNoise(vec2(u_time)), 0.0, 0.01) * 10.0;
            float tcNoise = max(vhsNoise(vec2(uvn.y * 100.0, u_time * 10.0)) - 0.5, 0.0);
            uvn.x = uvn.x - tcNoise * tcPhase * u_trackingIntensity * 20.0;
        }

        // Check bounds and sample texture
        vec4 texel = vec4(0.0);
        if (uvn.x >= 0.0 && uvn.x <= 1.0 && uvn.y >= 0.0 && uvn.y <= 1.0) {
            texel = texture2D(u_texture, uvn);
        }

        // VHS tracking darkening
        if (u_trackingIntensity > 0.0) {
            float tcPhase = clamp((sin(uvn.y * u_trackingFreq - u_time * PI * u_trackingSpeed) - 0.92) * vhsNoise(vec2(u_time)), 0.0, 0.01) * 10.0;
            texel.rgb *= 1.0 - tcPhase * u_trackingIntensity * 5.0;
        }

        // Scanlines
        if (u_scanlineIntensity > 0.0) {
            float scanline = sin((v_uv.y * 90.0 + u_time * 5.0) * 3.14159 * 2.0) * 0.5 + 0.5;
            texel.rgb *= 1.0 - u_scanlineIntensity + u_scanlineIntensity * scanline;
        }

        // RGB shift
        if (u_rgbShift > 0.0) {
            float r = texture2D(u_texture, vec2(uvn.x + u_rgbShift, uvn.y)).r;
            float g = texel.g;
            float b = texture2D(u_texture, vec2(uvn.x - u_rgbShift, uvn.y)).b;
            texel.rgb = vec3(r, g, b);
        }

        // Vignette
        float vignette = 1.0 - dot(cc, cc) * 1.3;
        texel.rgb *= vignette;

        // Random noise
        if (u_noise > 0.0) {
            float noiseVal = rand(uv + u_time) * u_noise * 2.0 - u_noise;
            texel.rgb += noiseVal;
        }

        // Flickering
        if (u_flickerIntensity > 0.0) {
            float flickerSpeed = u_flickerIntensity * 50.0; // Convert to speed range
            float flicker = sin(u_time * flickerSpeed) * 0.3 + 0.7; // Keep intensity constant, vary speed
            texel.rgb *= flicker;
        }

        // Clamp final color
        texel.rgb = clamp(texel.rgb, 0.0, 1.0);

        gl_FragColor = texel;
    }
`;

export const vhsUniforms = {
    u_time: { value: 0.0 },
    u_distortion: { value: 0.1 },
    u_scanlineIntensity: { value: 0.3 },
    u_rgbShift: { value: 0.02 },
    u_noise: { value: 0.1 },
    u_flickerIntensity: { value: 0.05 },
    u_trackingIntensity: { value: 0.1 },
    u_trackingSpeed: { value: 1.0 },
    u_trackingFreq: { value: 50.0 },
    u_waveAmplitude: { value: 0.1 }
};