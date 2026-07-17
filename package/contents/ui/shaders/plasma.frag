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
    for (int octave = 0; octave < 4; ++octave) {
        value += amplitude * noise(p);
        p = mat2(1.55, 1.20, -1.20, 1.55) * p;
        amplitude *= 0.5;
    }
    return value;
}

// Return the distance to a granule center, the distance from its boundary,
// and a stable per-cell value. The boundary distance gives the surface thin,
// irregular intergranular lanes instead of a generic cloudy noise texture.
vec3 cellular(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    float closest = 8.0;
    float secondClosest = 8.0;
    float cellValue = 0.0;

    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cellId = cell + neighbor;
            vec2 jitter = vec2(hash(cellId + vec2(17.13, 3.71)),
                               hash(cellId + vec2(5.37, 29.41)));
            vec2 delta = neighbor + mix(vec2(0.18), vec2(0.82), jitter) - local;
            float distanceSquared = dot(delta, delta);

            if (distanceSquared < closest) {
                secondClosest = closest;
                closest = distanceSquared;
                cellValue = hash(cellId + vec2(11.83, 47.19));
            } else if (distanceSquared < secondClosest) {
                secondClosest = distanceSquared;
            }
        }
    }

    float centerDistance = sqrt(closest);
    float boundaryDistance = sqrt(secondClosest) - centerDistance;
    return vec3(centerDistance, boundaryDistance, cellValue);
}

float segmentDistance(vec2 p, vec2 a, vec2 b, out float segmentPosition) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    segmentPosition = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
    return length(pa - ba * segmentPosition);
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
    float load = clamp(u_load, 0.0, 1.0);
    float temperature = clamp(u_temperature, 0.0, 1.0);
    // A fixed clock keeps all orbital and filament phases continuous through
    // load changes. Individual objects still receive their own speeds below.
    float time = u_time * 0.88;
    float centerY = 0.15 + 0.15 * load;
    vec2 position = vec2((qt_TexCoord0.x - 0.5) * aspect,
                         1.0 - qt_TexCoord0.y - centerY);
    float orbRadius = 0.052 + 0.145 * pow(load, 0.70);

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    // Differential rotation and two turbulence scales produce slowly evolving
    // convection cells, similar to granulation in solar surface imagery.
    vec2 coreDomain = position / max(orbRadius, 0.001);
    float radial = length(position) / max(orbRadius, 0.001);
    float angle = atan(position.y, position.x);
    float rotation = time * (0.16 + 0.09 * clamp(1.0 - radial, 0.0, 1.0));
    mat2 rotationMatrix = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
    vec2 rotatingDomain = rotationMatrix * coreDomain;
    float largeFlow = fbm(rotatingDomain * 1.55 + vec2(time * 0.10, -time * 0.14));
    vec2 cellDomain = rotatingDomain * 6.4
                      + vec2(largeFlow * 2.4, -largeFlow * 1.8)
                      + vec2(time * 0.13, -time * 0.09);
    float cellNoise = fbm(cellDomain);

    // Project the texture onto the visible hemisphere. This makes granules
    // compress naturally toward the limb instead of looking painted on a flat
    // disc, while the longitude offset suggests slow differential rotation.
    float surfaceDepth = sqrt(max(1.0 - min(dot(coreDomain, coreDomain), 1.0), 0.0));
    vec2 surfaceCoordinates = vec2(atan(coreDomain.x, max(surfaceDepth, 0.0001)),
                                   asin(clamp(coreDomain.y, -1.0, 1.0)));
    surfaceCoordinates.x += time * (0.055 + 0.025 * (1.0 - coreDomain.y * coreDomain.y));
    float surfaceFlow = fbm(surfaceCoordinates * 1.55 + vec2(8.7, -3.2));
    vec2 granulationDomain = surfaceCoordinates * 7.2
                             + vec2(surfaceFlow - 0.5, cellNoise - 0.5) * 1.35;
    vec3 granulation = cellular(granulationDomain);
    float granularNoise = noise(granulationDomain * 1.85 + vec2(-time * 0.045, time * 0.035));
    float granuleCenter = smoothstep(0.025, 0.17, granulation.y);
    granuleCenter *= mix(0.80, 1.08, granulation.z);
    granuleCenter *= mix(0.90, 1.08, granularNoise);
    float granuleRim = 1.0 - smoothstep(0.018, 0.105, granulation.y);

    // Sparse, slow-moving magnetic concentrations create umbra and penumbra
    // without turning the orb into a field of decorative spots.
    float magneticActivity = fbm(surfaceCoordinates * 1.28
                                 + vec2(time * 0.018 + 19.4, -7.6));
    magneticActivity += (noise(surfaceCoordinates * 3.7 + vec2(2.1, 13.8)) - 0.5) * 0.13;
    float spotPenumbra = smoothstep(0.61, 0.72, magneticActivity);
    float spotUmbra = smoothstep(0.72, 0.80, magneticActivity);

    float orbField = 1.0 - radial + (largeFlow - 0.5) * 0.27
                     + (cellNoise - 0.5) * 0.055;
    float interior = smoothstep(-0.09, 0.20, orbField);
    float hotCore = smoothstep(0.24, 0.78, orbField);
    float shell = smoothstep(-0.13, 0.02, orbField) - smoothstep(0.12, 0.30, orbField);

    // Long magnetic bands wind around the smaller convection cells and morph
    // at different speeds across the sphere.
    float magneticFlow = sin(angle * 5.0 + largeFlow * 10.0
                             + radial * 4.0 - time * (1.1 + radial * 0.6));
    float veins = smoothstep(0.78, 0.98, abs(magneticFlow))
                  * interior * (1.0 - hotCore * 0.55) * 0.62;
    float atmosphereBand = smoothstep(0.58, 0.94, radial)
                           * (1.0 - smoothstep(0.88, 1.13, radial))
                           * smoothstep(0.46, 0.88,
                                        sin(angle * 3.0 - time * 0.72 + largeFlow * 7.0) * 0.5 + 0.5);
    float corePulse = 0.91 + 0.09 * sin(time * 2.7 + largeFlow * 4.0);
    float upperCore = smoothstep(-0.72, 0.68, coreDomain.y);
    float coreDistribution = cellNoise * 0.62 + upperCore * 0.30
                             + granuleCenter * 0.18;
    vec3 coreColor = thermalColor(temperature, coreDistribution, hotCore);
    float limbDarkening = mix(0.48, 1.0, pow(surfaceDepth, 0.38));
    coreColor *= mix(0.57, 1.22, granuleCenter) * limbDarkening;
    coreColor *= mix(1.0, 0.58, spotPenumbra);
    coreColor *= mix(1.0, 0.34, spotUmbra);
    color += coreColor * interior * corePulse;
    vec3 bandColor = thermalColor(temperature,
                                  0.48 + magneticFlow * 0.18 + upperCore * 0.22,
                                  0.76);
    color += bandColor * (shell * 0.62 + veins + atmosphereBand * 0.30);
    vec3 rimColor = thermalColor(temperature, cellNoise * 0.72, 0.24);
    color += rimColor * granuleRim * interior * (1.0 - spotPenumbra) * 0.10;
    alpha += interior * 0.88 + shell * 0.45 + veins * 0.35 + atmosphereBand * 0.16;

    // The chromosphere is deliberately ragged: large structures drift slowly
    // while finer tongues continually reshape its outer edge.
    float coronaNoise = fbm(coreDomain * 2.25 + vec2(-time * 0.16, time * 0.12));
    float coronaFine = noise(coreDomain * 8.0 + vec2(time * 0.34, -time * 0.29));
    float coronaField = 1.24 - radial + (coronaNoise - 0.5) * 0.42
                        + (coronaFine - 0.5) * 0.10;
    float corona = smoothstep(-0.23, 0.055, coronaField)
                   * (1.0 - smoothstep(-0.02, 0.14, orbField));
    vec3 coronaColor = thermalColor(temperature,
                                    coronaNoise * 0.70 + max(coreDomain.y, 0.0) * 0.24,
                                    0.34);
    color += coronaColor * corona * 0.46;
    alpha += corona * 0.32;

    if (u_showGlow > 0.5) {
        float auraDistance = length(position) / max(orbRadius, 0.001);
        float aura = exp(-auraDistance * auraDistance * 0.58) * mix(0.10, 0.28, load);
        color += thermalColor(temperature, 0.34, 0.18) * aura;
        alpha += aura * 0.65;
    }

    // Follow the legacy Canvas fountain geometry: every filament starts around
    // the orb, sweeps radially outward, and is strongly biased upward. This
    // preserves varied curves without wrapping the sphere in a ball of thread.
    int wispCount = min(5, int(floor(mix(2.0, 6.0, load) + 0.5)));
    for (int wispIndex = 0; wispIndex < 5; ++wispIndex) {
        if (wispIndex >= wispCount)
            break;

        float index = float(wispIndex);
        float seedA = hash(vec2(index, 1.19));
        float seedB = hash(vec2(index, 2.37));
        float baseAngle = index / float(wispCount) * 6.28318 + time * 0.30;
        float wispLength = orbRadius * (1.0 + load * 2.0)
                           + seedA * orbRadius * 0.70;
        vec2 previous = vec2(cos(baseAngle) * orbRadius * 0.8,
                             abs(sin(baseAngle)) * orbRadius * 0.24);
        float minimumDistance = 1000.0;
        float curvePosition = 0.0;
        for (int curveStep = 1; curveStep <= 8; ++curveStep) {
            float stepEnd = float(curveStep) / 8.0;
            float curveAngle = baseAngle
                               + sin(time * 0.70 + index * 2.1) * 0.50 * stepEnd;
            float curveRadius = orbRadius * 0.8 + wispLength * stepEnd;
            float drift = (fbm(vec2(index * 5.1 + stepEnd * 3.0, time * 0.60)) - 0.5)
                          * orbRadius * 0.85 * stepEnd;
            vec2 point = vec2(cos(curveAngle) * curveRadius + drift,
                              abs(sin(curveAngle)) * curveRadius * 0.30
                                  + stepEnd * wispLength * 0.70);
            float localPosition;
            float distanceToSegment = segmentDistance(position, previous, point, localPosition);
            if (distanceToSegment < minimumDistance) {
                minimumDistance = distanceToSegment;
                curvePosition = (float(curveStep - 1) + localPosition) / 8.0;
            }
            previous = point;
        }

        float taper = pow(max(1.0 - curvePosition, 0.0), 0.72);
        float travelingPulse = 0.58 + 0.42
                               * sin(curvePosition * 19.0 - time * 4.2 + seedB * 8.0);
        travelingPulse = smoothstep(0.18, 0.92, travelingPulse);
        float thickness = mix(1.2, 2.7, load) / max(u_resolution.y, 1.0) * taper;
        float filamentCore = smoothstep(thickness, thickness * 0.18, minimumDistance);
        float filamentGlow = smoothstep(thickness * 4.2, thickness * 0.55, minimumDistance) * 0.32;
        float filament = (filamentCore + filamentGlow) * taper
                         * mix(0.42, 1.0, travelingPulse);
        float filamentDistribution = seedA * 0.58 + curvePosition * 0.24
                                     + travelingPulse * 0.24;
        vec3 filamentColor = thermalColor(temperature,
                                          filamentDistribution,
                                          0.48 + travelingPulse * 0.46);
        color += filamentColor * filament * mix(0.20, 0.46, load);
        alpha += filament * mix(0.14, 0.34, load);
    }

    // Orbiting motes vary in brightness by depth, making their flattened paths
    // feel like tilted rings around the orb instead of a flat circle of dots.
    int maximumParticles = int(clamp(u_particleCount, 8.0, 150.0));
    int orbitCount = int(floor(mix(5.0, float(maximumParticles), load) + 0.5));
    float particleScale = clamp(u_particleSize, 0.5, 3.0);
    for (int particleIndex = 0; particleIndex < 150; ++particleIndex) {
        if (particleIndex >= orbitCount)
            break;

        float index = float(particleIndex);
        float seedA = hash(vec2(index, 3.11));
        float seedB = hash(vec2(index, 4.27));
        float seedC = hash(vec2(index, 5.39));
        float particleAngle = seedA * 6.28318 + time * mix(0.25, 1.05, seedC);
        float orbitRadius = orbRadius * mix(0.78, 3.15, seedB);
        float depth = sin(particleAngle);
        vec2 particlePosition = vec2(cos(particleAngle), depth * mix(0.38, 0.72, seedA))
                                * orbitRadius;
        particlePosition.y += sin(time * 1.7 + index) * 0.012;

        // Legacy Plasma uses 2-6 pixel motes. Preserve that readable scale and
        // let rare energetic particles grow to roughly eight pixels.
        float largeMote = step(0.88, seedC);
        float pixelRadius = mix(2.0, 6.0, pow(seedC, 1.35));
        float radius = pixelRadius / max(u_resolution.y, 1.0);
        radius *= mix(1.0, 1.38, largeMote) * particleScale;
        float particleDistance = length(position - particlePosition);
        float body = smoothstep(radius, radius * 0.24, particleDistance);
        float halo = smoothstep(radius * 3.8, radius * 0.65, particleDistance) * 0.35;
        float depthBrightness = mix(0.42, 1.0, depth * 0.5 + 0.5);
        float particle = (body + halo) * depthBrightness;
        float particleDistribution = seedA * 0.68
                                     + (depth * 0.5 + 0.5) * 0.28;
        vec3 particleColor = thermalColor(temperature,
                                          particleDistribution,
                                          0.38 + seedC * 0.58);
        color += particleColor * particle;
        alpha += particle * 0.72;
    }

    alpha = clamp(alpha, 0.0, 1.0) * qt_Opacity;
    fragColor = vec4(color * qt_Opacity, alpha);
}
