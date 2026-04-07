#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float u_time;
    float u_load;
    float u_showGlow;
    float u_particleSize;
    float u_particleCount;
    vec2 u_resolution;
    vec4 u_baseColor;
    vec4 u_brightColor;
    vec4 u_glowColor;
};

// Improved hash function for better pseudo-random distribution
float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    vec2 uv = qt_TexCoord0;
    float t = u_time * 0.6; // Slightly slower base time for a calm effect
    float load = clamp(u_load, 0.0, 1.0);
    float pSize = clamp(u_particleSize, 0.4, 3.0);

    vec3 accumColor = vec3(0.0);
    float accumAlpha = 0.0;

    const int MAX_PARTICLES = 200;
    float maxCount = clamp(u_particleCount, 1.0, float(MAX_PARTICLES));
    float minCount = max(1.0, floor(maxCount * 0.08));
    int activeCount = int(floor(mix(minCount, maxCount, load) + 0.5));

    for (int i = 0; i < MAX_PARTICLES; ++i) {
        if (i >= activeCount) break;

        float fi = float(i);

        // Random traits
        float hPhase = hash(vec2(fi, 1.11));
        float hSpread = hash(vec2(fi, 2.22));
        float hSize = hash(vec2(fi, 3.33));
        float hDrift = hash(vec2(fi, 4.44));

        // Create exactly 2 sizes: ~70% small, ~30% large
        float isLarge = step(0.7, hSize); // Returns 0.0 if small, 1.0 if large
        float baseRadius = mix(0.007, 0.018, isLarge) * pSize;

        // Large particles move slightly faster to create a subtle 3D parallax effect
        float speed = mix(0.12, 0.22, isLarge) + 0.04 * hash(vec2(fi, 5.55));

        float phase = fract(hPhase + t * speed);
        float rise = phase; // 0.0 (bottom) to 1.0 (top)

        // Y axis: steady upward motion
        float y = 1.1 - rise * 1.3;

        // X axis: spread outward gently, with soft wind drift
        float baseSpread = (hSpread - 0.5) * 1.1 * rise;
        float windDrift = sin(t * 1.2 + hDrift * 6.28 + rise * 3.0) * mix(0.03, 0.06, isLarge);
        float x = 0.5 + baseSpread + windDrift;

        // Smoothly scale up when spawning, scale down when dying
        float scale = smoothstep(0.0, 0.1, rise) * smoothstep(1.0, 0.7, rise);
        float radius = baseRadius * scale;

        // Perfectly round distance calculation
        vec2 d = uv - vec2(x, y);
        float dist = length(d);

        // Core and Halo logic
        // Softened the core so it doesn't look like a harsh laser dot
        float core = smoothstep(radius, radius * 0.3, dist);
        float halo = smoothstep(radius * 2.8, radius * 0.8, dist) * 0.35;

        // Very gentle, slow breathing pulse (no aggressive blinking)
        float gentlePulse = 0.9 + 0.1 * sin(t * 2.5 + hPhase * 10.0);

        float strength = (core * 0.7 + halo) * scale * gentlePulse;

        // Color mix logic
        // Multiplied 'core' by 0.55 so it never reaches 100% u_brightColor.
        // This prevents the centers from washing out into super white spots.
        vec3 pColor = mix(u_baseColor.rgb, u_brightColor.rgb, core * 0.55);

        accumColor += pColor * strength;
        accumAlpha += strength;
    }

    // Pilot flame / Emitter glow at the bottom
    float pilot = 0.0;
    if (u_showGlow > 0.5) {
        vec2 p = uv - vec2(0.5, 0.96);
        p.x *= 1.4; // Oval shape
        float radial = length(p);

        float pilotPulse = 0.85 + 0.15 * sin(t * 3.0);
        pilot = smoothstep(0.12, 0.0, radial) * (0.12 + 0.08 * load) * pilotPulse;
    }

    // Add base pilot glow
    vec3 finalColor = accumColor + mix(u_glowColor.rgb, u_baseColor.rgb, 0.4) * pilot;
    float finalAlpha = clamp(accumAlpha + pilot, 0.0, 1.0) * qt_Opacity;

    fragColor = vec4(finalColor, finalAlpha);
}
