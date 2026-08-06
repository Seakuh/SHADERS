void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalized pixel coordinates (from 0 to 1)
    fragCoord -= iResolution.xy*.5;
    vec2 uv = fragCoord/iResolution.yy;
    uv*=5.;
	float t = iTime*3.1415;
    
    float a = atan(uv.y, uv.x);
    float d = length(uv)-.3; 
    vec3 col = vec3(1.);
    float timeWobble = cos(t+d)*.01*d;
    float tt = mod(iTime*.5, .5)-.5;
    for(float j = 0.; j<10.; j+=.5){
        for(float i = 0.; i<6.28; i+=3.14*.125){
            float q = (j==0.?(tt+.5):1.);
            float p = i;//+sin(t+d)*.2;
            vec2 u = uv+vec2(sin(p), cos(p))*(j-timeWobble+tt-0.25)*q;
            col += smoothstep(.0, .013, length(u)-(smoothstep(0., 3.,j+tt)+timeWobble)* q*2.);
        }    
    }
	col = sin((mod(col, vec3(4.))+vec3(1.,0.0, 3.))*1.5707-(d*3.-a*3.)+t)*.5+.5;
    // Output to screen
    fragColor = vec4(col,1.0);
}