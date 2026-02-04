export const anamorphicBreatheFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;

    uniform float u_chromatic_enable;
    uniform float u_chromatic_amount;
    uniform float u_chromatic_speed;
    uniform float u_chromatic_style;

    uniform float u_defocus_enable;
    uniform float u_defocus_amount;
    uniform float u_defocus_speed;
    uniform float u_anamorphic_ratio;

    uniform float u_breathe_intensity;
    uniform float u_breathe_sync;

    void main() {
        vec2 uv = v_uv;
        float intensity = u_breathe_intensity;

        float breathePhase = sin(u_time * u_defocus_speed) * 0.5 + 0.5;
        float chromaticPhase = u_breathe_sync > 0.5 ? breathePhase : sin(u_time * u_chromatic_speed) * 0.5 + 0.5;

        vec3 finalColor = texture2D(u_texture, uv).rgb;

        // === CHROMATIC UNDULATION ===
        if (u_chromatic_enable > 0.5) {
            float chromaAmt = u_chromatic_amount * chromaticPhase * intensity * 0.015;

            vec2 rOffset;
            vec2 bOffset;

            if (u_chromatic_style < 0.5) {
                float angle = u_time * u_chromatic_speed * 0.3;
                rOffset = vec2(cos(angle), sin(angle)) * chromaAmt;
                bOffset = vec2(cos(angle + 2.094), sin(angle + 2.094)) * chromaAmt;
            } else {
                float wave = sin(uv.y * 8.0 + u_time * u_chromatic_speed);
                rOffset = vec2(chromaAmt * wave, 0.0);
                bOffset = vec2(-chromaAmt * wave, 0.0);
            }

            finalColor.r = texture2D(u_texture, uv + rOffset).r;
            finalColor.b = texture2D(u_texture, uv + bOffset).b;
        }

        // === ANAMORPHIC DEFOCUS (simple box blur) ===
        if (u_defocus_enable > 0.5 && u_defocus_amount > 0.01) {
            float blurAmt = u_defocus_amount * breathePhase * intensity * 0.05;
            float ratio = u_anamorphic_ratio;

            vec3 blurred = vec3(0.0);
            blurred += texture2D(u_texture, uv + vec2(-blurAmt * ratio, 0.0)).rgb;
            blurred += texture2D(u_texture, uv + vec2(blurAmt * ratio, 0.0)).rgb;
            blurred += texture2D(u_texture, uv + vec2(-blurAmt * ratio * 0.5, -blurAmt * 0.3)).rgb;
            blurred += texture2D(u_texture, uv + vec2(blurAmt * ratio * 0.5, -blurAmt * 0.3)).rgb;
            blurred += texture2D(u_texture, uv + vec2(-blurAmt * ratio * 0.5, blurAmt * 0.3)).rgb;
            blurred += texture2D(u_texture, uv + vec2(blurAmt * ratio * 0.5, blurAmt * 0.3)).rgb;
            blurred += texture2D(u_texture, uv).rgb;
            blurred = blurred / 7.0;

            finalColor = mix(finalColor, blurred, min(blurAmt * 10.0, 1.0));
        }

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export const anamorphicBreatheUniforms = {
    u_time: { value: 0.0 },
    u_chromatic_enable: { value: 1.0 },
    u_chromatic_amount: { value: 0.5 },
    u_chromatic_speed: { value: 0.8 },
    u_chromatic_style: { value: 1.0 },
    u_defocus_enable: { value: 1.0 },
    u_defocus_amount: { value: 0.4 },
    u_defocus_speed: { value: 0.5 },
    u_anamorphic_ratio: { value: 1.5 },
    u_breathe_intensity: { value: 1.0 },
    u_breathe_sync: { value: 1.0 }
};
