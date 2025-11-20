#define TAU 6.28318530718
#define PI 3.14159265359
#define hue(v) ( .6 + .6 * cos( 2.*PI*(v) + vec3(0,-2.*PI/3.,2.*PI/3.) ) )


#define MORPH_SPEED 0.4
#define SHIMMER_TWIST 4.
#define SHIMMER_ARMS 6.
#define SHIMMER_SCALE 0.1
#define SHIMMER_INTENSITY 2.5
#define SHIMMER_SPEED 0.8
#define SHIMMER_SHARPNESS -0.5
#define SHIMMER_HUE_SHIFT 0.05
#define LAYER_COUNT 6.
#define SPIRAL_ARMS 12.
#define SPIRAL_SPEED 0.5
#define TWIST 6.
#define HUE_SHIFT_SPEED -0.2
 

float XOR(float a, float b)
{
   return a*(1.-b) + b*(1. -a);
}

 mat2 Rot(float a) {
    float s=sin(a), c=cos(a);
    return mat2(c, -s, s, c);
}



void mainImage( out vec4 fragColor, in vec2 fragCoord )
{    
    vec2 uv = (fragCoord.xy -.5 * iResolution.xy) / iResolution.y;
    uv *= Rot(iTime *-.1);
    
    float angle = atan(uv.x, uv.y) / TAU +.5;
    float dist = length(uv) ;
    float p1 , p2 = 0.;
    float spiralSpeed = iTime * SPIRAL_SPEED;
    float morphPhase = abs(sin(iTime * MORPH_SPEED));
    float armedAngle = angle * SPIRAL_ARMS;
    float twistedDist = dist * TWIST; 
            
    for (float i = 0.; i <1.; i += 1. / LAYER_COUNT)   // Get polaroids
    {
        
        float a = fract(armedAngle + (twistedDist * i));
        float b = min(a, 1. -a);
        float c = fract((dist * 5.) - spiralSpeed + i);
        float d = min(c, 1. - c);        
        float e = b  * .5  -d * mix(1., dist, morphPhase);
        float alpha = 0.2 + (0.8 * i);
        p1 = max(p1 , smoothstep(0.15 , 0.16 , e) * alpha);
        p2 = max(p2, smoothstep(0.12 , 0.14 , e) * alpha);                
        
    }                    
    float p = XOR(p1, p2); // darken inner part
                
    // poor mans shimmer        
    float a = fract(angle * SHIMMER_ARMS + (dist * SHIMMER_TWIST) - (iTime * SHIMMER_SPEED));
    float b = min(a, 1. -a);
    float shimmer = SHIMMER_INTENSITY * smoothstep(SHIMMER_SCALE, SHIMMER_SCALE * SHIMMER_SHARPNESS , b * dist ) * smoothstep(0.0, 0.2, dist);
    p *= (1. +(shimmer * p1));
    
    
    
    

    vec3 col = hue((shimmer * SHIMMER_HUE_SHIFT ) + -angle + dist +  (iTime * HUE_SHIFT_SPEED)) * p;
    
    
    // Debugs
    //col = vec3(max(max(col.r, col.g), col.b)) + angle;  // Angle
    //col = vec3(max(max(col.r, col.g), col.b)) + dist;  // Dist
    //col += shimmer;  // shimmer
    
    
    fragColor = vec4(col,1.0);
}