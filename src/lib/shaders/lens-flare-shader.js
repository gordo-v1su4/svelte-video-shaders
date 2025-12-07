export const lensFlareFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform float u_flareBrightness;
    uniform float u_flareSize;
    uniform float u_flareSpeed;
    uniform float u_flareShape;
    uniform float u_ghostScale;
    uniform float u_haloScale;
    uniform float u_starBurst;
    uniform vec3 u_sunPosition;
    uniform float u_anamorphic;
    uniform vec3 u_colorGain; // RGB color gain
    uniform float u_secondaryGhosts;
    uniform float u_additionalStreaks;

    #define PI 3.14159265359

    // Hash function for noise
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Star burst pattern
    float starBurst(vec2 uv, vec2 center, float intensity) {
        vec2 dir = normalize(uv - center);
        float angle = atan(dir.y, dir.x);
        float dist = length(uv - center);
        
        // Create star points
        float star = 0.0;
        for(int i = 0; i < 6; i++) {
            float a = angle + float(i) * PI / 3.0;
            star += abs(sin(a * 4.0)) * exp(-dist * 10.0);
        }
        
        return star * intensity * 0.1;
    }

    // Ghost flare
    float ghost(vec2 uv, vec2 center, float scale) {
        vec2 dir = uv - center;
        float dist = length(dir);
        return exp(-dist * dist / (scale * scale)) * 0.3;
    }

    // Anamorphic streak
    float streak(vec2 uv, vec2 center, float intensity) {
        vec2 dir = uv - center;
        float dist = length(dir);
        float angle = atan(dir.y, dir.x);
        
        // Create horizontal streak
        float streak = exp(-abs(dir.y) * 50.0) * exp(-abs(dir.x) * 2.0);
        return streak * intensity;
    }

    void main() {
        vec4 color = texture2D(u_texture, v_uv);
        
        // Convert sun position from 3D to screen space (assuming center is 0.5, 0.5)
        vec2 sunPos = u_sunPosition.xy;
        if (u_sunPosition.z < 0.0) {
            // Use mouse/follow mode - sunPos is already in screen space
        } else {
            // Project 3D position to screen (simplified)
            sunPos = vec2(0.5, 0.5) + u_sunPosition.xy * 0.1;
        }
        
        vec2 center = sunPos;
        vec2 uv = v_uv;
        
        // Main flare
        vec2 dir = uv - center;
        float dist = length(dir);
        
        // Anamorphic distortion
        if (u_anamorphic > 0.0) {
            dir.x *= 0.5;
            dist = length(dir);
        }
        
        // Main flare core
        float flare = exp(-dist * dist / (u_flareSize * u_flareSize * 0.01));
        flare = pow(flare, u_flareShape);
        
        // Animated flare
        float timeOffset = u_time * u_flareSpeed;
        flare *= (0.8 + 0.2 * sin(timeOffset));
        
        // Ghost flares (secondary reflections)
        float ghostFlare = 0.0;
        if (u_secondaryGhosts > 0.0) {
            for(int i = 1; i <= 3; i++) {
                float ghostDist = dist * (1.0 + float(i) * 0.3);
                float ghostIntensity = exp(-ghostDist * ghostDist / (u_ghostScale * u_ghostScale * 0.01));
                ghostFlare += ghostIntensity * 0.2;
            }
        }
        
        // Additional streaks
        float streaks = 0.0;
        if (u_additionalStreaks > 0.0) {
            streaks = streak(uv, center, 0.3);
        }
        
        // Star burst
        float star = 0.0;
        if (u_starBurst > 0.0) {
            star = starBurst(uv, center, u_haloScale);
        }
        
        // Combine all flare effects
        float totalFlare = (flare + ghostFlare + streaks + star) * u_flareBrightness;
        
        // Apply color gain
        vec3 flareColor = totalFlare * u_colorGain;
        
        // Add flare to image
        color.rgb += flareColor;
        
        // Tone mapping
        color.rgb = color.rgb / (1.0 + color.rgb);
        
        gl_FragColor = color;
    }
`;

export const lensFlareUniforms = {
    u_time: { value: 0.0 },
    u_flareBrightness: { value: 1.0 },
    u_flareSize: { value: 0.005 },
    u_flareSpeed: { value: 0.4 },
    u_flareShape: { value: 0.1 },
    u_ghostScale: { value: 0.1 },
    u_haloScale: { value: 0.5 },
    u_starBurst: { value: 1.0 },
    u_sunPosition: { value: [0.5, 0.5, -1.0] }, // z < 0 means follow mouse mode
    u_anamorphic: { value: 0.0 },
    u_colorGain: { value: [1.0, 0.8, 0.6] }, // Warm white
    u_secondaryGhosts: { value: 1.0 },
    u_additionalStreaks: { value: 1.0 }
};

