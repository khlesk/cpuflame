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

// Pseudo-random noise function
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
    float t = u_time * 0.8;

    // Center point (near the bottom)
    vec2 center = vec2(0.5, 0.85 - 0.15 * load);
    float orbR = 0.05 + 0.15 * load;

    vec3 color = vec3(0.0);
    float alpha = 0.0;

    // 1. Outer Glow / Aura
    if (u_showGlow > 0.5) {
        float dAura = length(uv - center);
        float aura = smoothstep(orbR * 3.5, orbR * 0.5, dAura) * (0.15 + 0.1 * load);
        color += u_glowColor.rgb * aura;
        alpha += aura * 0.6;
    }

    // 2. Smooth Upward Wisps (Using Bezier Curves to prevent "Spider Legs")
    int wispCount = int(floor(mix(2.0, 6.0, load) + 0.5));
    float wispStrength = 0.15 + 0.2 * load;

    for (int w = 0; w < 8; ++w) {
        if (w >= wispCount) break;

        float fw = float(w);
        float h1 = hash(vec2(fw, 1.1));
        float h2 = hash(vec2(fw, 1.2));

        // Spread distributes the wisps evenly from left to right (-1.0 to 1.0)
        float spread = (wispCount > 1) ? (fw / float(wispCount - 1) - 0.5) * 2.0 : 0.0;

        // End point: X fans outwards, Y goes strictly UP (negative offset in canvas coords)
        float endX = spread * (0.3 + 0.15 * h1);
        float endY = -(0.25 + 0.25 * h2); // Enforces upward movement
        vec2 endPoint = center + vec2(endX, endY) * (0.5 + 0.7 * load);

        // Add gentle waving animation to the tips
        endPoint.x += sin(t * 1.5 + fw) * 0.03;

        // Control point: pushes the curve to bend outwards before reaching the end
        float ctrlX = spread * (0.4 + 0.2 * h1);
        float ctrlY = -0.05 - 0.1 * h2;
        vec2 ctrlPoint = center + vec2(ctrlX, ctrlY) * (0.5 + 0.7 * load);

        // Draw the smooth curve using 6 line segments
        vec2 prevP = center;
        float minDist = 999.0;

        for (int step = 1; step <= 6; ++step) {
            float ts = float(step) / 6.0;
            // Quadratic Bezier interpolation
            vec2 p = mix(mix(center, ctrlPoint, ts), mix(ctrlPoint, endPoint, ts), ts);

            float d = sdSegment(uv, prevP, p);
            minDist = min(minDist, d);
            prevP = p;
        }

        // Taper the thickness of the line towards the end
        float distFromCenter = length(uv - center);
        float fade = 1.0 - smoothstep(0.0, length(endPoint - center), distFromCenter);
        float pulseWisp = 0.8 + 0.2 * sin(t * 3.0 + fw);

        // Draw crisp line core + soft glow
        float lineCore = smoothstep(0.015, 0.002, minDist);
        float lineGlow = smoothstep(0.035, 0.003, minDist) * 0.4;
        float lineTotal = max(lineCore, lineGlow) * fade * pulseWisp;

        vec3 wCol = mix(u_baseColor.rgb, u_brightColor.rgb, 0.3 + 0.4 * h1);
        color += wCol * lineTotal * wispStrength;
        alpha += lineTotal * wispStrength;
    }

    // 3. Orbiting Particles
    int maxParticles = int(clamp(u_particleCount, 8.0, 150.0));
    int orbitCount = int(floor(mix(5.0, float(maxParticles), load) + 0.5));
    float pSize = clamp(u_particleSize, 0.5, 3.0);

    for (int i = 0; i < 150; ++i) {
        if (i >= orbitCount) break;

        float fi = float(i);
        float h1 = hash(vec2(fi, 3.1));
        float h2 = hash(vec2(fi, 4.2));
        float h3 = hash(vec2(fi, 5.3));

        // Orbit logic: calculate angle based on time
        float startAngle = h1 * 6.2831853;
        // Some orbit clockwise, some counter-clockwise
        float direction = (h2 > 0.5) ? 1.0 : -1.0;
        float speed = (0.2 + 0.8 * h3) * direction;
        float angle = startAngle + t * speed;

        // Radius of orbit varies per particle
        float rad = orbR * (0.8 + 3.0 * h2);

        // Squashed Y axis to give the orbits a 3D tilted ring feeling
        float squashY = 0.4 + 0.4 * h1;
        vec2 offset = vec2(cos(angle), sin(angle) * squashY) * rad;

        // Add a slight vertical bob to the orbit so it's not perfectly flat
        offset.y += sin(t * 2.0 + fi) * 0.015;

        vec2 p = center + offset;

        // Crisp Particle Body (like the solid golden dots in the reference)
        float r = (0.002 + 0.007 * h3) * pSize;
        float pd = length(uv - p);

        float body = smoothstep(r, r * 0.4, pd);           // Solid inner dot
        float halo = smoothstep(r * 3.5, r * 0.8, pd) * 0.4; // Soft outer glow
        float inten = body + halo;

        // Flicker intensity slightly based on orbit position
        inten *= 0.6 + 0.4 * sin(angle * 2.0 + t);

        vec3 pCol = mix(u_baseColor.rgb, u_brightColor.rgb, h1);
        color += pCol * inten;
        alpha += inten;
    }

    // 4. Central Core Glow
    float d = length(uv - center);
    float pulse = 0.9 + 0.1 * sin(t * 4.0);
    float core1 = smoothstep(orbR * 0.4, 0.0, d) * pulse; // Bright hot center
    float core2 = smoothstep(orbR * 1.0, orbR * 0.2, d) * (0.7 + 0.3 * cos(t * 1.5)); // Softer edge

    color += u_brightColor.rgb * core1;
    color += mix(u_baseColor.rgb, u_brightColor.rgb, 0.6) * core2;
    alpha += core1 + core2 * 0.8;

    // Output
    alpha = clamp(alpha, 0.0, 1.0) * qt_Opacity;
    fragColor = vec4(color, alpha);
}
