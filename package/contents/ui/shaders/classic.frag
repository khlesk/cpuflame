#version 440

layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;

layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    float u_time;
    float u_load;
    float u_showGlow;
    vec2 u_resolution;
    vec4 u_baseColor;
    vec4 u_brightColor;
    vec4 u_glowColor;
};

// Standard pseudo-random noise setup
float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractal Brownian Motion (4 octaves for better wispy details)
float fbm(vec2 p) {
    float f = 0.0;
    float amp = 0.5;
    for(int i = 0; i < 4; ++i) {
        f += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return f;
}

void main() {
    vec2 uv = qt_TexCoord0;
    float load = clamp(u_load, 0.0, 1.0);

    // Animate faster when load is higher
    float t = u_time * (1.0 + 1.2 * load);

    // Y coordinate: 0.0 at the base (bottom), 1.0 at the top
    float yRaw = 1.0 - uv.y;

    // Scale height based on load. Minimum idle height is 0.15
    float flameHeight = mix(0.15, 1.0, load);
    float yN = yRaw / max(flameHeight, 0.001);

    // X coordinate centered around 0.0
    float x = uv.x - 0.5;

    // 1. Base Shape (Teardrop / Candle shape)
    // Pinches slightly at the bottom (0.0 to 0.1), then tapers off smoothly towards the top.
    float width = 0.45 * smoothstep(0.0, 0.1, yN) * smoothstep(1.1, 0.3, yN);
    width *= (0.6 + 0.4 * load); // Gets wider as load increases

    float xDist = abs(x) / max(width, 0.001);

    // 2. Organic Deformation (Wind & Turbulence)
    // Add a gentle sine wave to X to make the whole flame "dance" side to side
    float dance = sin(yN * 4.0 - t * 1.5) * 0.08 * yN;

    vec2 noiseUV = vec2((x + dance) * 3.5, yN * 2.5 - t * 1.2);
    float turb = fbm(noiseUV);

    // 3. Carving the Flame
    // Start with a solid shape (1.0 at center, fading to 0.0 at edges)
    float baseFlame = 1.0 - xDist;

    // Subtract noise. We multiply the noise impact by yN so the bottom
    // stays solid, but the top breaks apart into flying wisps.
    float noisePenalty = (1.0 - turb) * (0.3 + 1.5 * yN);
    float fire = baseFlame - noisePenalty;

    // Completely fade out above the flameHeight
    fire *= smoothstep(1.1, 0.8, yN);

    // 4. Heat mapping
    // Soften the fire edges, generating an organic, gaseous look
    float heat = smoothstep(0.0, 0.4, fire);
    float coreHeat = smoothstep(0.3, 0.8, fire); // Inner hotter region

    // 5. Coloring
    // Blend from base color (orange/red) to bright color (yellow/hot orange)
    vec3 col = mix(u_baseColor.rgb, u_brightColor.rgb, coreHeat);

    // Add a tiny bit of pure white/bright energy to the absolute hottest center
    col = mix(col, vec3(1.0, 0.95, 0.8), smoothstep(0.7, 1.0, fire) * 0.8);

    // 6. Base / Pilot Glow
    float glow = 0.0;
    if (u_showGlow > 0.5) {
        // Flatten the Y axis to make an oval glow at the base
        vec2 gp = vec2((uv.x - 0.5) * 1.5, yRaw - 0.02);
        float radial = length(gp);

        // Gentle pulsing on the glow
        float pulse = 0.85 + 0.15 * sin(u_time * 3.0);
        glow = smoothstep(0.4, 0.0, radial) * (0.15 + 0.25 * load) * pulse;
    }

    // Output
    vec3 finalColor = col * heat + u_glowColor.rgb * glow;
    float alpha = clamp(heat + glow, 0.0, 1.0) * qt_Opacity;

    fragColor = vec4(finalColor, alpha);
}
