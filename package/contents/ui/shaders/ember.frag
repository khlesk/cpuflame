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

vec2 emberPath(float age, float height, float launch, float curl, float seed, float time) {
    float rise = 1.0 - pow(1.0 - age, 1.6);
    float sway = sin(age * 7.0 + seed) - sin(seed);
    float wind = sin(time * 0.43 + age * 2.0) * 0.055;
    float x = launch * rise + (sway * curl + wind) * age * age;
    return vec2(x, 0.035 + height * rise);
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
    float redStage = smoothstep(0.64, 0.98, temperature);
    float particleScale = clamp(u_particleSize, 0.4, 3.0);
    // Never multiply accumulated time by a changing value. Doing so shifts
    // the phase of every particle whenever load changes and can make rising
    // embers jump backward.
    float time = u_time * 0.85;

    vec3 color = vec3(0.0);
    float energy = 0.0;
    float strongestSpark = 0.0;

    const int MAX_PARTICLES = 200;
    float configuredCount = clamp(u_particleCount, 1.0, float(MAX_PARTICLES));
    float population = mix(0.045, 1.0, pow(load, 0.8));
    float spreadLimit = min(0.34, aspect * 0.32);

    for (int i = 0; i < MAX_PARTICLES; ++i) {
        if (float(i) >= configuredCount)
            break;

        float index = float(i);
        float populationPosition = (index + 0.5) / configuredCount;
        float visibility = smoothstep(populationPosition - 0.025,
                                      populationPosition + 0.025, population);
        if (visibility <= 0.0)
            continue;

        // Each slot has a fixed clock. Randomize its next spark only while
        // it is invisible between lives, so paths never jump in mid-flight.
        float rate = mix(0.19, 0.36, hash(vec2(index, 6.13)));
        float clock = hash(vec2(index, 1.17)) + time * rate;
        float cycle = floor(clock);
        float phase = fract(clock);
        vec2 identity = vec2(index + 1.0, cycle + 1.0);
        float seed = hash(identity) * 6.28318;
        float sizeSeed = hash(identity + vec2(3.73, 7.19));
        float flightSeed = hash(identity + vec2(8.31, 2.91));
        float lifetime = mix(0.70, 0.98, hash(identity + vec2(1.53, 9.21)));
        float age = min(phase / lifetime, 1.0);
        float life = smoothstep(0.0, 0.045, age)
                     * (1.0 - smoothstep(0.60, 1.0, age)) * visibility;
        if (life <= 0.0)
            continue;

        // A single source feeds a varied spray. Taller trajectories become
        // visible with load; changing load never moves an existing spark.
        float maximumRise = mix(0.30, 0.86, pow(populationPosition, 0.55))
                            * mix(0.70, 1.0, flightSeed);
        float launch = (hash(identity + vec2(2.31, 4.17)) - 0.5) * 2.0 * spreadLimit;
        launch *= mix(0.35, 1.0, flightSeed);
        float curl = mix(0.02, 0.08, hash(identity + vec2(4.91, 3.11)))
                     * min(1.0, aspect);
        vec2 particlePosition = emberPath(age, maximumRise, launch, curl, seed, time);

        // Fine idle sparks grow into larger glowing fragments under load,
        // while retaining the particle-size control and variation in size.
        float pixelRadius = mix(0.8, 2.6, pow(sizeSeed, 2.0));
        pixelRadius *= clamp(u_resolution.y / 160.0, 0.55, 1.6);
        float radius = pixelRadius * particleScale / max(u_resolution.y, 1.0);
        radius *= mix(1.1, 0.55, age);
        radius = max(radius, 0.45 / max(u_resolution.y, 1.0));
        radius *= mix(1.0, 3.0, smoothstep(0.08, 1.0, load));

        // Sample the same trajectory slightly earlier so trails follow the
        // launch direction and the current, with a tapered, fading tail.
        float exposure = mix(0.045, 0.14, flightSeed);
        float previousAge = max(0.0, age - exposure * rate / lifetime);
        vec2 trailEnd = emberPath(previousAge, maximumRise, launch, curl, seed, time - exposure);
        float particleDistance = length(position - particlePosition);
        float trailDistance = sdSegment(position, particlePosition, trailEnd);
        vec2 trailVector = trailEnd - particlePosition;
        float tail = clamp(dot(position - particlePosition, trailVector)
                           / max(dot(trailVector, trailVector), 0.000001), 0.0, 1.0);
        float core = exp(-pow(particleDistance / radius, 2.0) * 1.8);
        float halo = exp(-pow(particleDistance / (radius * 3.5), 2.0)) * 0.18;
        float trail = exp(-pow(trailDistance / (radius * 0.65), 2.0))
                      * (1.0 - tail) * 0.65;

        float flicker = 0.88 + 0.12 * sin(time * 3.1 + seed + age * 9.0);
        float strength = (core + halo + trail) * life * flicker;
        float heat = clamp(1.05 - age * 0.7 + core * 0.3, 0.0, 1.0);
        float colorSeed = hash(identity + vec2(8.53, 1.37));
        float colorDistribution = colorSeed * 0.62 + age * 0.38;
        vec3 emberColor = thermalColor(temperature, colorDistribution, heat);
        vec3 hotCore = mix(vec3(0.65, 0.90, 1.0), vec3(1.0, 0.94, 0.68),
                          smoothstep(0.20, 0.60, temperature));
        hotCore = mix(thermalColor(temperature, colorDistribution, 1.0), hotCore, redStage);
        emberColor = mix(emberColor, hotCore, core * heat * 0.55);

        color += emberColor * strength;
        energy += strength;
        strongestSpark = max(strongestSpark, strength);
    }

    // The glowing fuel bed visually anchors the particles so they appear to
    // be emitted by a heat source instead of materializing at the lower edge.
    vec2 source = position - vec2(0.0, 0.035);
    float bedShape = exp(-dot(source / vec2(0.045, 0.022), source / vec2(0.045, 0.022)));
    float bedPulse = 0.90 + 0.06 * sin(time * 1.7) + 0.04 * sin(time * 2.9 + 1.0);
    float fuelBed = bedShape * mix(0.35, 0.85, load) * bedPulse;
    vec3 bedColor = thermalColor(temperature, 0.55, 0.95);
    color += bedColor * fuelBed;
    energy += fuelBed;

    if (u_showGlow > 0.5) {
        float glow = exp(-position.x * position.x * 15.0 - position.y * position.y * 48.0)
                     * mix(0.07, 0.22, load) * bedPulse;
        color += thermalColor(temperature, 0.32, 0.18) * glow;
        energy += glow;
    }

    // Compress blue/yellow light with one shared scale to preserve its hue.
    // Compressing each RGB channel separately turns dense clusters white.
    // Retain the warmer highlights of the red stage.
    float bounds = (1.0 - smoothstep(0.88, 0.98, position.y))
                   * (1.0 - smoothstep(0.42, 0.50, abs(qt_TexCoord0.x - 0.5)));
    float alpha = (1.0 - exp(-energy)) * bounds;
    float peak = max(color.r, max(color.g, color.b));
    vec3 huePreservingColor = color * ((1.0 - exp(-peak)) / max(peak, 0.00001));
    // Even hue-preserving compression washes out when complementary blue
    // and yellow sparks overlap. Give the dense glow a shared thermal tint;
    // isolated sparks keep their individual colors.
    vec3 glowTint = thermalColor(temperature, 1.0, 0.65);
    glowTint -= vec3(min(glowTint.r, min(glowTint.g, glowTint.b))) * 0.85;
    glowTint /= max(max(glowTint.r, max(glowTint.g, glowTint.b)), 0.00001);
    float overlap = smoothstep(0.25, 1.1, energy - strongestSpark);
    huePreservingColor = mix(huePreservingColor, glowTint * (1.0 - exp(-peak)), overlap);
    color = mix(huePreservingColor, vec3(1.0) - exp(-color), redStage) * bounds;
    fragColor = vec4(color, alpha) * qt_Opacity;
}
