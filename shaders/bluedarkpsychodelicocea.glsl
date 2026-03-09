// https://www.shadertoy.com/view/3cdXDr

// Author: EchoFlux
// Visualizing higher-dimensional space (4D-to-3D projection with cyberpunk blue emphasis)

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
    float time = iTime * 0.7;
    
    // Convert to polar coordinates
    float angle = atan(uv.y, uv.x);
    float radius = length(uv);

    // Simulate folding of higher dimensions
    float fold = sin(radius * 12.0 - time * 3.0 + sin(angle * 3.0 + time)) * 0.2;

    // Create looping hyperspace tunnel effect
    float tunnel = cos(radius * 8.0 - fold * 6.0 + sin(angle * 4.0 + time)) * 0.5;

    // Cyberpunk dominant blue palette
    vec3 col;
    col.r = 0.2 + 0.2 * sin(time + angle * 3.0);               // reduced red
    col.g = 0.4 + 0.3 * sin(time * 0.6 + angle * 4.0 + 1.0);   // teal/cyan tone
    col.b = 0.8 + 0.3 * sin(time + angle * 2.0 + 2.0);         // dominant blue

    col *= smoothstep(0.45, 0.0, abs(tunnel));

    // Blue-tinted core glow
    float glow = smoothstep(0.3, 0.0, radius);
    col += glow * vec3(0.3, 0.6, 1.3);  // glowing blue core

    fragColor = vec4(col, 1.0);
}
