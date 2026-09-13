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

float tongue(vec2 p, float width, float height, float offset, float lean, float travel, float seed) {
    float rise = clamp(p.y / height, 0.0, 1.0);
    float center = offset + lean * rise;
    float curl = noise(vec2(travel * 4.0, seed)) - 0.5;
    center += width * (curl * 1.6 + 0.25 * sin(travel * 7.0 + seed)) * rise * rise;
    float taper = pow(max(1.0 - rise, 0.0), 0.85);
    float radius = width * taper * mix(0.78, 1.0, smoothstep(0.0, 0.18, rise));
    float billow = noise(vec2(travel * 8.0, seed + 7.0));
    radius *= mix(1.0, 0.55 + billow * 0.9, smoothstep(0.05, 0.45, rise));
    // Measure from the edge in base-width units, so the feathering stays soft
    // as the tongue narrows instead of collapsing into a sharp outline.
    float field = (radius - abs(p.x - center)) / max(width, 0.001);
    return min(field, (height - p.y) * 4.0);
}

void main() {
    vec2 uv = qt_TexCoord0;
    float load = clamp(u_load, 0.0, 1.0);
    // Scaling elapsed time by load makes every load change jump in phase.
    float time = u_time;

    // Work in height-relative coordinates so the flame does not stretch with
    // wide panels or desktop widgets.
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    float y = 1.0 - uv.y;
    float flameHeight = mix(0.18, 0.88, pow(load, 0.72));
    float heightPosition = y / flameHeight;
    vec2 position = vec2((uv.x - 0.5) * aspect, heightPosition);
    float travel = position.y - time * 0.45;

    // Rising domain-warped noise gives the body coherent rolling eddies rather
    // than making every edge pixel jitter independently.
    vec2 flow = vec2(position.x * 3.1, travel * 2.15);
    vec2 warp = vec2(fbm(flow), fbm(flow + vec2(5.2, 1.3))) - 0.5;
    float turbulence = fbm(flow + warp * vec2(1.7, 1.15));
    float fineTurbulence = noise(flow * 3.3 + vec2(2.0, 0.0));

    // Keep the fuel-rich base steady, then let the centerline lean and curl
    // progressively as hot gases rise.
    float rise = smoothstep(0.0, 0.15, position.y);
    float baseWidth = mix(0.065, 0.31, pow(load, 0.55));
    float centerline = baseWidth * (sin(travel * 5.2) * 0.24
                                   + warp.x * 0.65) * rise * position.y;
    float localX = position.x - centerline;

    // Keep one continuous body. Additional tongues grow and dissolve on
    // independent schedules, with more opportunities to branch at high load.
    vec2 tonguePosition = vec2(localX, position.y);
    float mainHeight = 0.86 + 0.12 * noise(vec2(time * 0.28, 3.0));
    float flameField = tongue(tonguePosition, baseWidth * 0.72, mainHeight,
                              0.0, baseWidth * 0.12, travel, 0.0);
    for (int branch = 0; branch < 4; ++branch) {
        float index = float(branch);
        float seed = 17.3 + index * 23.7;
        float activity = noise(vec2(time * 0.32 + seed, seed));
        activity = smoothstep(0.52, 0.78, activity + load * 0.22)
                   * smoothstep(0.06 + index * 0.12, 0.35 + index * 0.15, load);
        float shape = noise(vec2(time * 0.21, seed + 5.0));
        float height = mix(0.20, 0.50 + shape * 0.42, activity);
        float width = baseWidth * mix(0.30, 0.52, shape);
        float offset = baseWidth * (noise(vec2(time * 0.17, seed + 11.0)) - 0.5) * 1.5;
        float lean = baseWidth * (noise(vec2(time * 0.23, seed + 19.0)) - 0.5) * 0.8;
        float branchField = tongue(tonguePosition, width, height, offset, lean, travel, seed);
        // Blend the field so a dormant tongue contributes neither an edge
        // nor a halo, and its appearance never switches abruptly.
        flameField = mix(flameField, max(flameField, branchField), activity);
    }

    float edgeBreakup = (turbulence - 0.5) * mix(0.10, 0.32, rise);
    edgeBreakup += (fineTurbulence - 0.5) * 0.05 * rise;
    flameField += edgeBreakup;

    float verticalMask = smoothstep(-0.025, 0.07, position.y)
                         * (1.0 - smoothstep(0.86, 1.0, position.y));
    float softness = max(0.18, 1.5 / max(u_resolution.y * baseWidth, 1.0));
    float outerHeat = smoothstep(-softness * 2.0, softness * 2.0, flameField) * verticalMask;
    float bodyHeat = smoothstep(-0.12, 0.65, flameField) * verticalMask;
    float coreHeat = smoothstep(0.12, 0.72, flameField)
                     * smoothstep(0.02, 0.22, position.y)
                     * (1.0 - smoothstep(0.38, 0.90, position.y));

    // Build the color inside the flame instead of tinting its whole body with
    // one temperature color. At low temperature the flame is blue. Yellow
    // rolls down from the turbulent tips through the middle range, while the
    // hottest range becomes mostly red with a few yellow combustion pockets.
    float temperature = clamp(u_temperature, 0.0, 1.0);
    float yellowAmount = smoothstep(0.20, 0.58, temperature);
    float redAmount = smoothstep(0.64, 0.98, temperature);

    float colorNoise = fbm(vec2(position.x * 7.5, travel * 3.8)
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

    // Translucent gas emits light through a soft envelope. Keep this local
    // halo on transparent backgrounds too; u_showGlow controls only the base.
    float density = mix(0.62, 0.88, smoothstep(0.20, 0.75, colorNoise));
    float flameAlpha = outerHeat * (0.28 + 0.62 * bodyHeat) * density;
    float haloDistance = max(0.0, 0.12 - flameField) / max(0.55, softness * 2.0);
    float haloAlpha = 0.16 * exp(-haloDistance * haloDistance) * verticalMask;
    flameAlpha += haloAlpha * (1.0 - flameAlpha);
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
