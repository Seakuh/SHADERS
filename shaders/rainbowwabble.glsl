#define PI 3.14159265359

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord.xy * 2. - iResolution.xy) / iResolution.y;
    vec3 c = vec3(0), p, v, tv, ap, hv, rv, dv, op, qp;
    vec4 colorWave;
    vec2 dc;
    float z = 0., d, oy, sv, sd, a, cd, bd, cyl, sph, org;
    
    for(float i = 0.; i < 85.; i++) {
        z = i * 0.0348;
        p = z * normalize(vec3(uv, 1.));
        p.z -= iTime * 1.0;
        vec3 qp = ceil(p / 0.471) * 0.471;
        
        float org = dot(cos(p * 2.18), sin(p.yzx * 0.34));
        d = 0.0107 + abs(org) * 0.423;
        z += d;
        c += (cos(sv / 0.0168 + p.x + iTime * PI / 2.0 - vec3(0, 1, 2) - 3.) + 1.5) / d;
    }
    
    c = abs(sin(c / 500.)) * 0.8;
    fragColor = vec4(c, 1.);
}