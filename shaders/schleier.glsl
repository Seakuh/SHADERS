//This is remix of a remix. Tried to clean up the code a bit but its late :)
//Also: The wave: fract(log(length(uv.xy))+iTime*.25) can
// be improved to be smoother if someone wants to give it a go

void mainImage(out vec4 o, vec2 u) {
    float i,f,r,a,h;
    vec2 p, uv = u/iResolution.xy-1.5;
    p = (uv+vec2(.6,-.1))*16.;
    uv*=vec2(fract(log(length(uv.xy))+iTime*.25));
    r = normalize(vec3(length(uv),0.1,0.51)).x;
    a = (log2(r) + iTime * 0.0122+10.)*3.344;
    h = atan(uv.y, uv.x)*3.344;
    
     for (o*=i; i++ <= 10.0; ) {
        vec2 v = p;
        for (f = 1.0; f <= 50.0; f*=1.5) {             
            v += mod(tan(cos(v.yx * f+f + i - iTime)),10.) / f;
            v += sin(vec2(h, a));
        }
        
     o += (2.*cos(i + vec4(5, 1, 2, 3)) + 1.0)/ (5.0 * length(v));  
     }
    o = tanh(o *.5)*2.5;
}