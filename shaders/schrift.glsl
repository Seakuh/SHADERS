void mainImage( out vec4 O, in vec2 I )
{

    vec2 U = ( I * 2. - iResolution.xy ) / iResolution.y;
    
    float T = iTime * .8;
    float t1 = T + sin(T*.7)*.3;
    float t2 = T * 1.3 + cos(T*.5)*.2;

    U += .15 * sin( U.yx * 3. + t1 );
    U += .075 * sin( U.yx * 6. + t1 * 1.5 );
    

    float c = cos(t2*.2), s = sin(t2*.2);
    U = mat2(c,-s,s,c) * U;
    U += .05 * sin( U * 12. + t2 );
    
    float d = length(U);
    U *= 1. + .2/(d+.5);
    U += .025 * sin( U.yx * 24. - t1*.5 );
    
    vec3 C = vec3(0);
    float E = 1.;
    for(float i=0.; i<3.; i++) {
        float f = 2. + i;
        float a = .4 - i*.1;
        float ph = i * 2.1;
        
        vec2 P = U * (1. + i*.15);
        float y = sin(P.x*f + t1*.7 + ph) * a;
        float D = abs(P.y - y);

        float I = exp(-D*D*800.) * .15;
        C += I * vec3(.9,.7,.5) * (1.-i*.3);
    }
    
    for(float i=0.; i<4.; i++) {
        float f = 4. + i*1.5;
        float ph = i * 1.57;
        
        vec2 Pr = U * 1.05;
        vec2 Pg = U;
        vec2 Pb = U * .95;
        
        float Dr = abs(Pr.y - sin(Pr.x*f + t1 + ph)*.3);
        float Dg = abs(Pg.y - sin(Pg.x*f + t1 + ph + .02)*.3);
        float Db = abs(Pb.y - sin(Pb.x*f + t1 + ph - .02)*.3);
        
        C.r += .08 / (Dr + .01) * exp(-Dr*Dr*200.);
        C.g += .08 / (Dg + .01) * exp(-Dg*Dg*200.);
        C.b += .08 / (Db + .01) * exp(-Db*Db*200.);
    }
    

    float interf = sin(U.x*16. + t2) * sin(U.y*16. - t2*.5);
    float D3 = abs(interf - .5*sin(t1));
    C += .03 / (D3 + .02) * vec3(.5,.8,1.) * (1.+sin(U.x*3.));

    float spread = length(fwidth(U)) * 20.;
    C += C * C * (1. + spread) * .3;
    

    float caust = pow(sin(U.x*8.+t1)*.5+.5, 4.) * pow(sin(U.y*8.-t1)*.5+.5, 4.);
    C += caust * .02 * vec3(.2,.6,1.);
    
    float V = 1. - dot(U,U)*.4;
    V = pow(V, 1.5);
    C *= V;
    

    C = max(vec3(0), C - .004);
    C = (C*(6.2*C+.5))/(C*(6.2*C+1.7)+.06);
    

    C = pow(C, vec3(.4545));
    

    float L = dot(C, vec3(.299,.587,.114));
    C = mix(vec3(L), C, 1.2);
    

    O = vec4(C, 1.);
}
