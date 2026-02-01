/*
    Playing with the turbulence from @Xor's "Rocaille [200]"
    https://www.shadertoy.com/view/WXyczK
*/

void mainImage(out vec4 o, vec2 u) {
    float i,s,d;
    vec3 p,r = iResolution;
    for(o*=i;i++<1e2;
        p = vec3((u+u-r.xy)/r.y * d, d - 12.),
        p +=sin(.4*iTime+2.*p.yxz+i)/2.,
        d += s = .01+.3*abs(length(p) - 8.),
        o += (1.+cos(d+iTime*2.+vec4(1,2,3,0)))/s
    );
    o = tanh(o*o/1e6);
}
