void mainImage(out vec4 o, vec2 u) {
    float i,d,s,t = iTime*3.;
    vec3  p = iResolution;    
    u = ((u-p.xy/2.)/p.y);
    for(o*=i; i++<80.;o += (1.+cos(d+vec4(4,2,1,0))) / s)
        p = vec3(u * d, d + t),
        p.xy *= mat2(cos(tanh(sin(t*.1)*4.)*3.+vec4(0,33,11,0))),
        p.xy -= vec2(sin(t*.07)*16., sin(t*.05)*16.),
        p += cos(t+p.y+p.x+p.yzx*.4)*.3,
        d += s = length(min( p = cos(p) + cos(p).yzx, p.zxy))*.3; 
    o = tanh(o / d / 2e2);
}
/*
    Playing with the laser field Xor demonstrates here:
    https://www.shadertoy.com/view/tct3Rf
*/
