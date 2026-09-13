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

// Return nearest-cell distance, boundary gap, and a stable plate value.
// The boundary gap traces a connected network of surface fractures.
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

vec4 particleHeatColor(float heat, float variation) {
    // Temperature changes the proportion of blue and yellow sparks. Each
    // spark fades through zero at its own threshold, keeping the switch smooth
    // without introducing a green or grey intermediate color.
    float yellowShare = smoothstep(0.0, 0.5, heat);
    float transition = yellowShare - mix(0.04, 0.96, variation);
    vec3 color = mix(vec3(0.04, 0.424, 1.0), vec3(1.0, 0.846, 0.04), step(0.0, transition));
    color = mix(color, vec3(1.0, 0.086, 0.04), smoothstep(0.5, 1.0, heat));
    float visibility = smoothstep(0.0, 0.035, abs(transition));
    return vec4(color * mix(0.82, 1.0, variation), visibility);
}

vec3 compressLight(vec3 light) {
    float peak = max(light.r, max(light.g, light.b));
    return light * ((1.0 - exp(-peak)) / max(peak, 0.00001));
}

void main() {
    float aspect = u_resolution.x / max(u_resolution.y, 1.0);
    float load = clamp(u_load, 0.0, 1.0);
    // Temperature follows the configured cool/hot range independently of
    // load, which controls the star's size and particle activity.
    float temperature = clamp(u_temperature, 0.0, 1.0);
    float warming = smoothstep(0.0, 0.5, temperature);
    float whiteHeat = smoothstep(0.55, 1.0, temperature);
    float patchHeat = smoothstep(0.12, 0.5, temperature) * (1.0 - whiteHeat);
    float time = u_time * 0.88;
    float pixel = 1.0 / max(u_resolution.y, 1.0);
    float centerY = 0.18 + 0.18 * load;
    vec2 position = vec2((qt_TexCoord0.x - 0.5) * aspect,
                         1.0 - qt_TexCoord0.y - centerY);
    float orbRadius = max(pixel, min(0.065 + 0.14 * pow(load, 0.70), aspect * 0.28));
    vec2 coreDomain = position / orbRadius;
    float radial = length(coreDomain);
    vec2 direction = coreDomain / max(radial, 0.001);
    float edgeWidth = max(pixel * 0.8 / orbRadius, 0.008);
    float sphereMask = 1.0 - smoothstep(1.0 - edgeWidth, 1.0 + edgeWidth, radial);
    vec3 light = vec3(0.0);
    float lightEnergy = 0.0;
    vec3 particleLight = vec3(0.0);
    float particleEnergy = 0.0;
    vec3 plasmaColor = mix(vec3(0.025, 0.38, 1.0), vec3(0.22, 0.73, 1.0), warming);
    plasmaColor = mix(plasmaColor, vec3(0.96, 0.98, 1.0), whiteHeat);

    // An opaque, shaded crust fills the disc. Project a stable fracture map
    // onto the hemisphere and rotate it slowly, without twisting its center.
    float surfaceDepth = sqrt(max(1.0 - dot(coreDomain, coreDomain), 0.0));
    vec3 normal = normalize(vec3(coreDomain, max(surfaceDepth, 0.001)));
    vec2 surface = vec2(atan(coreDomain.x, max(surfaceDepth, 0.001)),
                        asin(clamp(coreDomain.y, -1.0, 1.0)));
    surface.x += time * 0.045;
    vec2 warp = vec2(fbm(surface * 2.1 + vec2(8.7, -3.2)),
                     fbm(surface * 2.1 + vec2(-4.3, 12.6))) - 0.5;
    vec2 plates = surface * 2.0 + warp * 1.1;
    vec3 fracture = cellular(plates);
    fracture.y = max(0.0, fracture.y + (noise(plates * 9.0) - 0.5) * 0.025);
    vec3 fineFracture = cellular(plates * 2.8 + vec2(6.3, -2.7));
    float roughness = noise(plates * 5.0);
    float illumination = 0.3 + 0.7 * max(dot(normal, normalize(vec3(-0.5, 0.6, 0.8))), 0.0);
    float plateShade = mix(0.55, 1.2, fracture.z) * mix(0.75, 1.1, roughness);
    // Heat flows independently of the rotating crust. Evolving local warps
    // stretch and merge hot patches while the fracture geometry stays stable.
    vec2 heatWarp = vec2(noise(surface * 2.0 + vec2(time * 0.22, 17.0)),
                         noise(surface * 2.0 + vec2(-9.0, -time * 0.17))) - 0.5;
    vec2 heatDrift = vec2(time * 0.16, -time * 0.11);
    float patchNoise = fbm(surface * 1.8 + warp * 0.6 + heatWarp * 0.8
                          + heatDrift + vec2(12.3, -5.7));
    float hotPatch = smoothstep(0.43, 0.59, patchNoise) * patchHeat;
    // The crust stays charcoal at every temperature. Moving heat colors
    // belong only to the fractures and the corona, never the solid plates.
    vec3 crust = vec3(0.028, 0.032, 0.04) * illumination * plateShade;

    // Large connected fissures and sparse hairline branches reveal heat
    // beneath the crust. Their geometry stays stable as the light pulses.
    float crackWidth = clamp(fwidth(fracture.y) * 0.55, 0.012, 0.065);
    float crack = 1.0 - smoothstep(crackWidth, crackWidth * 2.2, fracture.y);
    float crackHalo = exp(-fracture.y * 13.0) * 0.32;
    float fineWidth = clamp(fwidth(fineFracture.y) * 0.4, 0.008, 0.045);
    float hairline = (1.0 - smoothstep(fineWidth, fineWidth * 2.0, fineFracture.y))
                     * smoothstep(0.70, 0.90, fracture.z) * 0.18;
    float heatFlow = 0.7 + 0.3 * noise(surface * 2.4 + vec2(-time * 0.24, 5.1));
    float fissure = (crack + crackHalo + hairline) * heatFlow * mix(0.7, 1.3, load);
    fissure *= mix(0.38, 1.0, pow(surfaceDepth, 0.4)) * (0.75 + illumination * 0.25);
    vec3 fissureColor = mix(plasmaColor, vec3(1.0, 0.90, 0.12), hotPatch);
    light += fissureColor * fissure * sphereMask;
    lightEnergy += fissure * sphereMask;

    // Sample direction in Cartesian coordinates so the corona has no seam.
    // Uneven radial falloff makes wisps instead of a uniform luminous ring.
    float coronaFlow = fbm(direction * 3.8 + vec2(time * 0.11, -time * 0.09)
                           - direction * (radial - 1.0) * 1.4);
    float coronaDetail = noise(direction * 15.0 + vec2(time * 0.35, -time * 0.27));
    float extent = mix(0.12, 0.55, coronaFlow) * mix(0.65, 1.15, load);
    float outside = max(radial - 1.0, 0.0);
    float corona = exp(-outside / max(extent, 0.02))
                   * (0.15 + 0.65 * coronaFlow + 0.2 * coronaDetail)
                   * (1.0 - sphereMask) * 0.65;
    light += plasmaColor * corona;
    lightEnergy += corona;

    // Filaments sweep outward around the whole star. Each arc has its
    // own lifetime and a new shape on rebirth, with smooth fades.
    for (int arcIndex = 0; arcIndex < 7; ++arcIndex) {
        float index = float(arcIndex);
        float clock = time * mix(0.065, 0.11, hash(vec2(index, 2.71)))
                      + hash(vec2(index, 1.19));
        float cycle = floor(clock);
        float age = fract(clock);
        vec2 identity = vec2(index + 3.0, cycle + 7.0);
        float seedA = hash(identity);
        float seedB = hash(identity + vec2(4.1, 9.7));
        float activity = smoothstep(0.0, 0.18, age)
                         * (1.0 - smoothstep(0.65, 1.0, age));
        activity *= smoothstep(0.35, 0.7, seedB + load * 0.45);
        if (activity <= 0.0)
            continue;
        float startAngle = seedA * 6.28318 + sin(time * 0.14 + seedB * 6.0) * 0.13;
        vec2 outward = vec2(cos(startAngle), sin(startAngle));
        vec2 tangent = vec2(-outward.y, outward.x);
        // Leave room for the curved tip on each side of the widget.
        vec2 reach = vec2(aspect * 0.42, outward.y >= 0.0 ? 0.90 - centerY : centerY - 0.035)
                     / max(abs(outward) + abs(tangent) * 0.16, vec2(0.001));
        float available = max(0.0, min(reach.x, reach.y) - orbRadius);
        float lift = min(orbRadius * mix(1.3, 2.6, load) * mix(0.75, 1.1, seedB), available)
                     * mix(0.55, 1.0, activity);
        vec2 previous = outward * orbRadius;
        float minimumDistance = 1000.0;
        float curvePosition = 0.0;
        for (int curveStep = 1; curveStep <= 10; ++curveStep) {
            float t = float(curveStep) / 10.0;
            float bend = sin(t * 4.0 + time * 0.45 + seedB * 6.0) * lift * 0.16 * t;
            vec2 point = outward * (orbRadius + lift * t) + tangent * bend;
            float localPosition;
            float distanceToSegment = segmentDistance(position, previous, point, localPosition);
            if (distanceToSegment < minimumDistance) {
                minimumDistance = distanceToSegment;
                curvePosition = (float(curveStep - 1) + localPosition) / 10.0;
            }
            previous = point;
        }
        float taper = pow(max(1.0 - curvePosition, 0.0), 0.72);
        float thickness = max(pixel * 0.6, orbRadius * 0.012) * mix(0.7, 1.2, load)
                          * max(taper, 0.15);
        float core = exp(-pow(minimumDistance / thickness, 2.0));
        float glow = exp(-pow(minimumDistance / (thickness * 3.5), 2.0)) * 0.22;
        float pulse = 0.65 + 0.35 * sin(curvePosition * 12.0 - time * 2.0 + seedA * 8.0);
        float arc = (core + glow) * activity * pulse * taper * (1.0 - sphereMask);
        light += plasmaColor * arc;
        lightEnergy += arc;
    }

    // Stable elliptical orbits carry particles around the star. The far
    // half passes behind the crust, while the near half crosses its face.
    const int MAX_PARTICLES = 200;
    float configuredCount = clamp(u_particleCount, 1.0, float(MAX_PARTICLES));
    float population = mix(0.04, 1.0, load);
    float particleScale = clamp(u_particleSize, 0.4, 3.0);
    for (int particleIndex = 0; particleIndex < MAX_PARTICLES; ++particleIndex) {
        if (float(particleIndex) >= configuredCount)
            break;
        float index = float(particleIndex);
        float rank = (index + 0.5) / configuredCount;
        float visibility = smoothstep(rank - 0.025, rank + 0.025, population);
        if (visibility <= 0.0)
            continue;
        float seedA = hash(vec2(index, 3.11));
        float seedB = hash(vec2(index, 4.27));
        float seedC = hash(vec2(index, 5.39));
        float angle = seedA * 6.28318 + time * mix(0.25, 1.05, seedC);
        float depth = sin(angle);
        float orbitRadius = min(orbRadius * mix(1.15, 2.8, seedB), aspect * 0.43);
        vec2 particlePosition = vec2(cos(angle), depth * mix(0.38, 0.72, seedA)) * orbitRadius;
        particlePosition.y += sin(time * 0.6 + index) * orbRadius * 0.05;
        float radius = max(pixel * 0.5, mix(0.7, 1.9, seedC * seedC) * pixel
                           * particleScale * mix(0.7, 1.7, load));
        float particleDistance = length(position - particlePosition);
        float core = exp(-pow(particleDistance / radius, 2.0) * 1.5);
        float halo = exp(-pow(particleDistance / (radius * 3.0), 2.0)) * 0.18;
        float depthBrightness = mix(0.42, 1.0, depth * 0.5 + 0.5);
        float occlusion = 1.0 - sphereMask * (1.0 - smoothstep(-0.08, 0.08, depth));
        float particle = (core + halo) * visibility * depthBrightness * occlusion;
        vec4 particleColor = particleHeatColor(temperature, hash(vec2(index, 7.83)));
        particle *= particleColor.a * mix(1.0, 2.2, smoothstep(0.5, 1.0, temperature));
        particleLight += particleColor.rgb * particle;
        particleEnergy += particle;
    }

    if (u_showGlow > 0.5) {
        float aura = exp(-radial * radial * 0.65) * mix(0.08, 0.18, load) * (1.0 - sphereMask);
        light += plasmaColor * aura;
        lightEnergy += aura;
    }

    // Keep the star opaque, then add particles as a separate emissive layer.
    // Screen blending cannot darken an existing crack when a red spark passes
    // in front of it, and preserves premultiplied alpha outside the sphere.
    vec3 emission = compressLight(light);
    float emissionAlpha = 1.0 - exp(-lightEnergy);
    vec3 color = emission + crust * sphereMask * (1.0 - emissionAlpha);
    float alpha = emissionAlpha + sphereMask * (1.0 - emissionAlpha);
    vec3 particleEmission = compressLight(particleLight);
    float particleAlpha = 1.0 - exp(-particleEnergy);
    color += particleEmission * (vec3(1.0) - color);
    alpha += particleAlpha * (1.0 - alpha);
    float y = 1.0 - qt_TexCoord0.y;
    float bounds = smoothstep(0.0, 0.025, y) * (1.0 - smoothstep(0.90, 0.98, y))
                   * (1.0 - smoothstep(0.42, 0.50, abs(qt_TexCoord0.x - 0.5)));
    fragColor = vec4(color, alpha) * bounds * qt_Opacity;
}
