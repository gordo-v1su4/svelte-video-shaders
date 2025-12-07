export const crtFragmentShader = `
    varying vec2 v_uv;
    uniform sampler2D u_texture;
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform float u_pixelSize;
    uniform float u_distortion;
    uniform float u_blur;
    uniform float u_aberration;
    uniform float u_scanlineIntensity;
    uniform float u_scanlineSpeed;
    uniform float u_gridIntensity;
    uniform float u_vignetteIntensity;
    uniform float u_dither;

    // Random function
    float rand(vec3 p) {
        return fract(sin(dot(p, vec3(829., 4839., 432.))) * 39428.);
    }

    // Read texture with smooth edge
    vec4 readTex(vec2 uv) {  
        vec4 c = texture2D(u_texture, uv);  
        c.a *= smoothstep(.5, .499, abs(uv.x - .5)) * smoothstep(.5, .499, abs(uv.y - .5));
        return c;
    }

    // Zoom function
    vec2 zoom(vec2 uv, float t) {
        return (uv - .5) * t + .5;
    }

    // Wave function for distortion
    float wave(float y) {
        return sin(y * 1190. + u_time * 3.) * sin(y * 1001. + u_time * 7.) * sin(y * 1479. + u_time * .5) * 0.001;
    }

    // Grayscale conversion
    float gray(vec3 rgb) {
        return pow(dot(rgb, vec3(.21, .72, .1)), 2.2);
    }

    void main() {
        vec2 fc = v_uv * u_resolution;
        vec2 fp = fract(fc / u_pixelSize) * 2. - 1.;
        float pixel = 1. - length(fp*fp*fp); 

        // Pixelize
        fc = floor(fc / u_pixelSize) * u_pixelSize;    

        vec2 uv = fc / u_resolution;
        vec2 p = uv * 2. - 1.;
        p.x *= u_resolution.x / u_resolution.y;
        float l = length(p); 
         
        // Distort
        float dist = pow(l, 2.) * u_distortion;
        dist = smoothstep(0., 1., dist);
        uv = zoom(uv, 0.5 + dist);          
            
        // Blur
        vec2 du = (uv - .5);
        float a = atan(p.y, p.x);
        float rd = rand(vec3(a, u_time, 0));
        uv = (uv - .5) * (1.0 + rd * pow(l * 0.7, 3.) * u_blur) + .5;
            
        vec2 uvr = uv;
        vec2 uvg = uv;
        vec2 uvb = uv;
            
        // Chromatic aberration
        float d = (1. + sin(uv.y * 20. + u_time * 3.) * 0.1) * u_aberration;
        uvr.x += 0.0015;
        uvb.x -= 0.0015;
        uvr = zoom(uvr, 1. + d * l * l);
        uvb = zoom(uvb, 1. - d * l * l);    
            
        vec4 cr = readTex(uvr);
        vec4 cg = readTex(uvg);
        vec4 cb = readTex(uvb);  
        
        float gr = gray(cr.rgb);
        float gg = dot(cg.rgb, vec3(.21, .72, .1));  
        float gb = dot(cb.rgb, vec3(.21, .72, .1));  
        
        vec4 outColor = vec4(
            vec3(.3, .5, .0) * gr + vec3(.1, .9, .2) * gg + vec3(.0, .3, .9) * gb,
            cr.a + cg.a + cb.a
        );
        outColor *= pixel;

        vec4 deco;

        // Scanline
        float res = u_resolution.y;
        deco += (
            sin(uv.y * res * .7 + u_time * u_scanlineSpeed) *
            sin(uv.y * res * .3 - u_time * u_scanlineSpeed * 1.3)
        ) * u_scanlineIntensity;

        // Grid
        deco += smoothstep(.01, .0, min(fract(uv.x * 20.), fract(uv.y * 20.))) * u_gridIntensity;

        outColor += deco * smoothstep(2., 0., l);
        
        // Vignette
        outColor *= 1.8 - l * l * u_vignetteIntensity;  

        // Dither
        outColor += rand(vec3(p, u_time)) * u_dither;     

        gl_FragColor = outColor;
    }
`;

export const crtUniforms = {
    u_time: { value: 0.0 },
    u_resolution: { value: [1920, 1080] },
    u_pixelSize: { value: 5.0 },
    u_distortion: { value: 0.3 },
    u_blur: { value: 0.3 },
    u_aberration: { value: 0.05 },
    u_scanlineIntensity: { value: 0.05 },
    u_scanlineSpeed: { value: 100.0 },
    u_gridIntensity: { value: 0.1 },
    u_vignetteIntensity: { value: 1.0 },
    u_dither: { value: 0.1 }
};

