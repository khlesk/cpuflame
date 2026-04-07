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

// Standard pseudo-random noise function
float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// Distance to a line segment
float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main() {
    vec2 uv = qt_TexCoord0;
    float load = clamp(u_load, 0.0, 1.0);
    float t = u_time * 0.5; // Scaled time for smoother animation

    // Center point (near the bottom of the canvas)
    vec2 center = vec2(0.5, 0.85 - 0.1 * load);
    float orbR = 0.06 + 0.15 * load;

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    // 1. Outer Glow / Aura
    if (u_showGlow > 0.5) {
        float dAura = length(uv - center);
        float aura = smoothstep(orbR * 3.5, orbR * 0.5, dAura) * (0.15 + 0.1 * load);
        color += u_glowColor.rgb * aura;
        alpha += aura * 0.6;
    }

    // 2. Smooth Parabolic Wisps (Fountain Effect)
    int wispCount = int(floor(mix(3.0, 7.0, load) + 0.5));
    float wispStrength = 0.1 + 0.2 * load;

    for (int w = 0; w < 8; ++w) {
        if (w >= wispCount) break;

        float fw = float(w);
        float randSeed = hash(vec2(fw, 1.1));

        // Base angle: pointing UP (-PI/2 in UI coordinate space where Y points down)
        // Spread them out like a fan based on their index
        float spread = (fw / float(max(1, wispCount-1)) - 0.5) * 1.8;
        float ang = -1.5707 + spread + (randSeed - 0.5) * 0.3;

        // Initial velocity vector
        float lenMax = orbR * (3.0 + 2.0 * hash(vec2(fw, 2.2))) * load;
        vec2 dir = vec2(cos(ang), sin(ang)) * lenMax;

        // "Gravity" / Drag vector pulling the ends outwards and downwards
        vec2 bend = vec2(sign(spread) * 0.4, 0.5) * lenMax;

        // Draw curve using multiple segments to make it smooth
        vec2 prevP = center;
        float minDist = 999.0;

        // Determine line thickness based on animation
        float pulseWisp = 1.0 + 0.2 * sin(t * 3.0 + fw);

        for (int step = 1; step <= 5; ++step) {
            float t_step = float(step) / 5.0;
            // Parabolic curve equation: P = P0 + V*t + 0.5*A*t^2
            vec2 p = center + dir * t_step + bend * t_step * t_step;

            float d = sdSegment(uv, prevP, p);
            minDist = min(minDist, d);
            prevP = p;
        }

        // Taper the line so it fades out
        float distFromCenter = length(uv - center);
        float fade = 1.0 - smoothstep(0.0, lenMax * 1.2, distFromCenter);

        // Core thin line + outer glow for the line
        float lineCore = smoothstep(0.006, 0.001, minDist);
        float lineGlow = smoothstep(0.035, 0.002, minDist) * 0.4;
        float lineTotal = (lineCore + lineGlow) * fade * pulseWisp;

        vec3 wCol = mix(u_baseColor.rgb, u_brightColor.rgb, 0.4 + 0.3 * randSeed);
        color += wCol * lineTotal * wispStrength;
        alpha += lineTotal * wispStrength;
    }

    // 3. Floating Embers / Particles
    int maxParticles = int(clamp(u_particleCount, 8.0, 150.0));
    int partCount = int(floor(mix(5.0, float(maxParticles), load) + 0.5));
    float pSize = clamp(u_particleSize, 0.5, 2.0);

    for (int i = 0; i < 150; ++i) {
        if (i >= partCount) break;

        float fi = float(i);
        float h1 = hash(vec2(fi, 3.1));
        float h2 = hash(vec2(fi, 4.2));
        float h3 = hash(vec2(fi, 5.3));

        // Start particles near center, shoot them upwards in a cone
        float angle = -1.5707 + (h1 - 0.5) * 2.2;
        float speed = 0.1 + 0.3 * h2;

        // Loop the particle lifetime so they keep generating
        float lifeSpan = 1.0 + h3;
        float localTime = mod(t * speed + h1 * 10.0, lifeSpan);
        float lifeRatio = localTime / lifeSpan; // 0.0 to 1.0

        // Calculate particle position
        vec2 startPos = center + vec2((h2-0.5)*0.05, 0.0);
        vec2 velocity = vec2(cos(angle), sin(angle)) * (0.3 + 0.3 * load);
        vec2 gravity = vec2(sign(cos(angle)) * 0.1, 0.2); // pulls outwards and down

        // Add a little sine wave drift to X to make them floaty
        vec2 drift = vec2(sin(t * 2.0 + fi) * 0.02 * lifeRatio, 0.0);

        vec2 p = startPos + velocity * localTime + gravity * localTime * localTime + drift;

        // Particle size varies (some are distinct dots, some are tiny)
        float r = (0.002 + 0.006 * h3) * pSize;

        // Fade in and out based on lifespan
        float pFade = smoothstep(0.0, 0.1, lifeRatio) * smoothstep(1.0, 0.6, lifeRatio) * load;

        float pd = length(uv - p);

        // Solid body (like the distinct dots in the reference image) + soft halo
        float body = smoothstep(r, r * 0.7, pd);
        float halo = smoothstep(r * 3.0, r, pd) * 0.3;
        float inten = (body + halo) * pFade;

        vec3 pCol = mix(u_baseColor.rgb, u_brightColor.rgb, h1);
        color += pCol * inten;
        alpha += inten;
    }

    // 4. Central Core Glow
    float d = length(uv - center);
    float pulse = 0.9 + 0.1 * sin(t * 5.0);
    float core1 = smoothstep(orbR * 0.5, 0.0, d) * pulse; // Bright hot center
    float core2 = smoothstep(orbR * 1.2, orbR * 0.2, d) * (0.6 + 0.4 * cos(t * 2.0)); // Softer edge

    color += u_brightColor.rgb * core1;
    color += mix(u_baseColor.rgb, u_brightColor.rgb, 0.5) * core2;
    alpha += core1 + core2 * 0.8;

    // Output
    alpha = clamp(alpha, 0.0, 1.0) * qt_Opacity;
    fragColor = vec4(color, alpha);
}
