#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float u_time;
    float u_load;
    float u_temperature;
    float u_showGlow;
    vec2 u_resolution;
    vec4 u_baseColor;
    vec4 u_brightColor;
    vec4 u_glowColor;
};

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    local = local * local * (3.0 - 2.0 * local);

    float a = hash(cell);
    float b = hash(cell + vec2(1.0, 0.0));
    float c = hash(cell + vec2(0.0, 1.0));
    float d = hash(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; ++octave) {
        value += amplitude * noise(p);
        p = mat2(1.62, 1.18, -1.18, 1.62) * p;
        amplitude *= 0.5;
    }
    return value;
}

void main() {
    vec2 uv = qt_TexCoord0;
    float load = clamp(u_load, 0.0, 1.0);
    float time = u_time * mix(0.85, 1.9, load);

    // Work in height-relative coordinates so the flame does not stretch with
    // wide panels or desktop widgets.
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    float y = 1.0 - uv.y;
    float flameHeight = mix(0.18, 1.02, pow(load, 0.72));
    float heightPosition = y / flameHeight;
    vec2 position = vec2((uv.x - 0.5) * aspect, heightPosition);

    // Rising domain-warped noise gives the body coherent rolling eddies rather
    // than making every edge pixel jitter independently.
    vec2 flow = vec2(position.x * 3.1, position.y * 2.15 - time * 1.35);
    vec2 warp = vec2(fbm(flow + vec2(0.0, time * 0.17)),
                     fbm(flow + vec2(5.2, -time * 0.11))) - 0.5;
    float turbulence = fbm(flow + warp * vec2(1.7, 1.15));
    float fineTurbulence = noise(flow * 3.3 + vec2(2.0, -time * 2.1));

    // Keep the fuel-rich base steady, then let the centerline lean and curl
    // progressively as hot gases rise.
    float rise = smoothstep(0.0, 0.15, position.y);
    float centerline = sin(position.y * 5.2 - time * 1.45) * 0.025 * position.y;
    centerline += (warp.x * 0.16 + sin(position.y * 11.0 + time) * 0.012)
                  * rise * position.y;
    float localX = position.x - centerline;

    float taper = pow(max(1.0 - position.y * 0.82, 0.0), 0.58);
    float baseWidth = mix(0.065, 0.31, pow(load, 0.55));
    float width = baseWidth * mix(0.72, 1.0, rise) * (0.22 + 0.78 * taper);
    float normalizedDistance = abs(localX) / max(width, 0.001);

    float edgeBreakup = (turbulence - 0.5) * mix(0.16, 0.72, rise);
    edgeBreakup += (fineTurbulence - 0.5) * 0.12 * rise;
    float flameField = 1.0 - normalizedDistance + edgeBreakup;

    // Carve the upper body into independently moving tongues. This mostly
    // disappears near idle and becomes visible when there is enough flame.
    float forkMask = smoothstep(0.48, 0.92, position.y) * smoothstep(0.18, 0.65, load);
    float forkCenter = centerline + (warp.y - 0.5) * 0.055;
    float fork = exp(-pow((position.x - forkCenter) / max(width * 0.34, 0.015), 2.0));
    flameField -= fork * forkMask * (0.22 + 0.34 * turbulence);

    float verticalMask = smoothstep(-0.025, 0.07, position.y)
                         * smoothstep(1.12, 0.83, position.y);
    float outerHeat = smoothstep(-0.22, 0.08, flameField) * verticalMask;
    float bodyHeat = smoothstep(-0.02, 0.42, flameField) * verticalMask;
    float coreHeat = smoothstep(0.30, 0.82, flameField)
                     * smoothstep(0.02, 0.22, position.y)
                     * smoothstep(0.90, 0.38, position.y);

    // Build the color inside the flame instead of tinting its whole body with
    // one temperature color. At low temperature the flame is blue. Yellow
    // rolls down from the turbulent tips through the middle range, while the
    // hottest range becomes mostly red with a few yellow combustion pockets.
    float temperature = clamp(u_temperature, 0.0, 1.0);
    float yellowAmount = smoothstep(0.20, 0.58, temperature);
    float redAmount = smoothstep(0.64, 0.98, temperature);

    float colorNoise = fbm(vec2(position.x * 7.5 - time * 0.16,
                                position.y * 3.8 - time * 1.55)
                           + warp * 1.4);
    float upperBody = smoothstep(0.12, 0.68, position.y);
    float yellowPattern = smoothstep(0.25, 0.72,
                                     colorNoise + upperBody * 0.48
                                     + bodyHeat * 0.14);

    vec3 deepBlue = vec3(0.015, 0.055, 0.62);
    vec3 propaneBlue = vec3(0.025, 0.38, 1.0);
    vec3 cyanBlue = vec3(0.08, 0.82, 1.0);
    vec3 flameYellow = vec3(1.0, 0.72, 0.025);
    vec3 hotYellow = vec3(1.0, 0.96, 0.28);
    vec3 flameRed = vec3(0.94, 0.045, 0.008);
    vec3 hotRed = vec3(1.0, 0.19, 0.015);

    vec3 blueColor = mix(deepBlue, propaneBlue, bodyHeat);
    blueColor = mix(blueColor, cyanBlue, coreHeat * 0.82);
    vec3 yellowColor = mix(flameYellow, hotYellow, coreHeat);
    vec3 redColor = mix(flameRed, hotRed, coreHeat * 0.72 + colorNoise * 0.18);

    float yellowMask = yellowAmount * yellowPattern;
    vec3 flameColor = mix(blueColor, yellowColor, yellowMask);

    // Red blankets nearly all of a fully hot flame. Noise leaves irregular
    // yellow windows, and a narrow blue fuel line survives at the very base.
    float redCoverage = redAmount
                        * (0.82 + 0.18 * smoothstep(0.28, 0.72, colorNoise));
    flameColor = mix(flameColor, redColor, redCoverage);

    float yellowRemnant = redAmount * yellowPattern
                          * smoothstep(0.56, 0.76, colorNoise + coreHeat * 0.24)
                          * 0.82;
    flameColor = mix(flameColor, hotYellow, yellowRemnant);

    float blueFuelLine = (1.0 - smoothstep(0.015, 0.10, position.y))
                         * smoothstep(0.15, 0.72, bodyHeat)
                         * (0.32 + 0.68 * temperature);
    flameColor = mix(flameColor, propaneBlue, blueFuelLine);

    // Retain the darker translucent rim so the distributed colors still read
    // as a single flame against both transparent and opaque backgrounds.
    flameColor *= mix(0.48, 1.0, bodyHeat);

    float flameAlpha = outerHeat * (0.30 + 0.70 * bodyHeat);
    vec3 premultipliedColor = flameColor * flameAlpha;

    float glow = 0.0;
    if (u_showGlow > 0.5) {
        vec2 glowPosition = vec2((uv.x - 0.5) * aspect * 1.25, y * 2.8);
        float pulse = 0.90 + 0.10 * sin(u_time * 3.1 + turbulence * 2.0);
        glow = exp(-dot(glowPosition, glowPosition) * 7.0)
               * mix(0.10, 0.32, load) * pulse;
    }

    premultipliedColor += u_glowColor.rgb * glow;
    float alpha = clamp(flameAlpha + glow, 0.0, 1.0) * qt_Opacity;
    fragColor = vec4(premultipliedColor * qt_Opacity, alpha);
}
