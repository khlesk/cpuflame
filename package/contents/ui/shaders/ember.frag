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
    float u_particleSize;
    float u_particleCount;
    vec2 u_resolution;
    vec4 u_baseColor;
    vec4 u_brightColor;
    vec4 u_glowColor;
};

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float projection = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
    return length(pa - ba * projection);
}

vec3 thermalColor(float temperature, float distribution, float highlight) {
    vec3 deepBlue = vec3(0.015, 0.055, 0.62);
    vec3 propaneBlue = vec3(0.025, 0.38, 1.0);
    vec3 cyanBlue = vec3(0.08, 0.82, 1.0);
    vec3 flameYellow = vec3(1.0, 0.72, 0.025);
    vec3 hotYellow = vec3(1.0, 0.96, 0.28);
    vec3 flameRed = vec3(0.94, 0.045, 0.008);
    vec3 hotRed = vec3(1.0, 0.19, 0.015);

    float t = clamp(temperature, 0.0, 1.0);
    float pattern = clamp(distribution, 0.0, 1.0);
    float brightness = clamp(highlight, 0.0, 1.0);
    vec3 blue = mix(deepBlue, propaneBlue, 0.35 + brightness * 0.65);
    blue = mix(blue, cyanBlue, brightness * 0.62);
    vec3 yellow = mix(flameYellow, hotYellow, brightness);
    vec3 red = mix(flameRed, hotRed, brightness * 0.78);

    float yellowMask = smoothstep(0.20, 0.58, t)
                       * smoothstep(0.22, 0.74, pattern);
    vec3 result = mix(blue, yellow, yellowMask);

    float redAmount = smoothstep(0.64, 0.98, t);
    float redCoverage = redAmount
                        * (0.82 + 0.18 * smoothstep(0.28, 0.72, pattern));
    result = mix(result, red, redCoverage);

    float yellowRemnant = redAmount * smoothstep(0.74, 0.92, pattern) * 0.86;
    return mix(result, hotYellow, yellowRemnant);
}

void main() {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    vec2 position = vec2((qt_TexCoord0.x - 0.5) * aspect, 1.0 - qt_TexCoord0.y);
    float load = clamp(u_load, 0.0, 1.0);
    float temperature = clamp(u_temperature, 0.0, 1.0);
    float particleScale = clamp(u_particleSize, 0.4, 3.0);
    // Never multiply accumulated time by a changing value. Doing so shifts
    // the phase of every particle whenever load changes and can make rising
    // embers jump backward.
    float time = u_time * 0.85;

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    const int MAX_PARTICLES = 200;
    float configuredCount = clamp(u_particleCount, 1.0, float(MAX_PARTICLES));
    int activeCount = int(floor(mix(max(2.0, configuredCount * 0.08), configuredCount, load) + 0.5));

    for (int i = 0; i < MAX_PARTICLES; ++i) {
        if (i >= activeCount)
            break;

        float index = float(i);
        float seed = hash(vec2(index, 1.17));
        float spreadSeed = hash(vec2(index, 2.31));
        float sizeSeed = hash(vec2(index, 3.73));
        float driftSeed = hash(vec2(index, 4.91));
        float speedSeed = hash(vec2(index, 6.13));

        float speed = mix(0.14, 0.33, speedSeed);
        float phase = fract(seed + time * speed);
        // Low-index particles are always the short trajectories. Higher load
        // reveals progressively taller ones without moving existing embers.
        float populationPosition = index / max(configuredCount - 1.0, 1.0);
        float maximumRise = mix(0.38, 1.12, pow(populationPosition, 0.65));
        float particleY = -0.025 + phase * maximumRise;

        // Embers emerge from a narrow fuel bed, then fan out and meander in
        // the convection current. A low-frequency wind keeps nearby sparks
        // moving in the same general direction.
        float spread = mix(0.045, 0.52, pow(phase, 0.72));
        spread *= mix(0.55, 1.0, populationPosition);
        float wind = sin(time * 0.82) * 0.075 * phase;
        float flutter = sin(time * (1.4 + speedSeed) + driftSeed * 6.28318 + phase * 8.0);
        float particleX = (spreadSeed - 0.5) * 2.0 * spread + wind
                          + flutter * mix(0.015, 0.09, phase);
        vec2 particlePosition = vec2(particleX, particleY);

        float birth = smoothstep(0.0, 0.09, phase);
        float cooling = smoothstep(1.0, 0.62, phase);
        float life = birth * cooling;
        // Use larger 6-18 logical pixel embers, with occasional fragments
        // extending beyond that range. Keeping the radius in pixels makes
        // sparks equally readable in short panels and large widgets.
        float rareFragment = step(0.91, sizeSeed);
        float pixelRadius = mix(6.0, 18.0, pow(sizeSeed, 1.45));
        float radius = pixelRadius / max(u_resolution.y, 1.0);
        radius *= mix(1.0, 1.28, rareFragment) * particleScale;
        // Keep the larger embers for active loads, while idle mode uses the
        // original 3-9 pixel scale.
        radius *= mix(0.5, 1.0, pow(load, 0.72));
        // Keep embers closer to their birth size as they rise; only half of
        // the previous distance-based shrink remains.
        radius *= mix(1.12, 0.85, phase) * life;

        // A short streak below each particle gives faster embers a natural
        // motion blur without making the entire cloud look like round dots.
        float trailLength = mix(0.012, 0.065, speedSeed) * life;
        vec2 trailEnd = particlePosition - vec2(flutter * 0.006, trailLength);
        float particleDistance = length(position - particlePosition);
        float trailDistance = sdSegment(position, particlePosition, trailEnd);
        float core = smoothstep(radius, radius * 0.20, particleDistance);
        float halo = smoothstep(radius * 2.5, radius * 0.72, particleDistance) * 0.27;
        float trail = smoothstep(radius * 0.82, radius * 0.16, trailDistance)
                      * smoothstep(0.0, 0.025, trailLength) * 0.52;

        float flicker = 0.78 + 0.22 * sin(time * (5.0 + speedSeed * 4.0) + seed * 19.0);
        float strength = (core + halo + trail) * life * flicker;
        float heat = clamp(1.05 - phase + core * 0.3, 0.0, 1.0);
        // Each ember samples a neighboring part of the heat palette. Height
        // biases the yellow phase upward while the seed leaves cooler blue
        // sparks between it; at maximum temperature most particles turn red.
        float heightBias = clamp(particleY / max(maximumRise, 0.001), 0.0, 1.0);
        float colorSeed = hash(vec2(index, 8.53));
        float colorDistribution = colorSeed * 0.62 + heightBias * 0.38;
        vec3 emberColor = thermalColor(temperature, colorDistribution, heat);
        emberColor *= mix(0.58, 1.12, heat);

        color += emberColor * strength;
        alpha += strength * 0.72;
    }

    // The glowing fuel bed visually anchors the particles so they appear to
    // be emitted by a heat source instead of materializing at the lower edge.
    float bedShape = exp(-position.x * position.x * 42.0 - position.y * position.y * 260.0);
    float bedPulse = 0.86 + 0.14 * sin(u_time * 3.3);
    float fuelBed = bedShape * mix(0.20, 0.48, load) * bedPulse;
    vec3 bedColor = thermalColor(temperature, 0.18 + bedPulse * 0.08, 0.48);
    color += bedColor * fuelBed;
    alpha += fuelBed * 0.8;

    if (u_showGlow > 0.5) {
        float glow = exp(-position.x * position.x * 15.0 - position.y * position.y * 48.0)
                     * mix(0.07, 0.22, load) * bedPulse;
        color += thermalColor(temperature, 0.32, 0.18) * glow;
        alpha += glow;
    }

    alpha = clamp(alpha, 0.0, 1.0) * qt_Opacity;
    fragColor = vec4(color * qt_Opacity, alpha);
}
