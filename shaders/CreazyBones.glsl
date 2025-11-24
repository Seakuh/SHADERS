// https://iquilezles.org/articles/distfunctions
// 
/***********************
Definition of the objects we want to use
***********************/
float sdVerticalCapsule( vec3 p, float h, float r )
{
    // Slice shift effect (only applied on instance of capsule)
    p.x += clamp(sign(cos(iTime*10.+p.y*10.))/5.,0.,0.1)*.7  ;
    
    // Capsule formula
    p.y -= clamp( p.y, 0.0, h );
    return length( p ) - r;
}

float sphere(vec3 p, float radius)
{
    p += vec3(sin(iTime),cos(iTime),cos(iTime))/10.; // Sphere will move
    return length(p)- radius;
}

float box(vec3 p,vec3 c){
   
	vec3 q = abs(p) - c;
    return min(0.,max(q.x,max(q.y,q.z))) + length(max(q,0.));
}

/***********************
The Map / Signed distance function.
Where you weld all your objects on the scene

Basically, we are only interested to know how far we are from any points in the overall objects in the scene.
The function take the current position of the ray and return a float representing the distance of 
this point compare to the overall structure
***********************/
float SDF(vec3 p){

///// Pre effects that will affect all the objects
 
     // Here the camera travelling
     // Cicle on X and Y, Going Forward on Z (and some visual effect)         
     p += vec3(p.z*sin(-iTime)/4.,cos(iTime)/4., sin(p.y+iTime)+iTime*4.);
     //         ^ Yaw
     //             ^ Translation X
     //                               ^ Translation Y
     //                      ^-------------^ 
     //                             |
     //                            Circular movement on XY
     //                                              ^ Wave effect on Z
     //                                                            ^ Going Foward
 
     // Repetition
     // If you remove it, only display an element (but remove also the iTime on Z to avoid going forward)
     p = mod(p,3.) -3.*.5;
     

///// Object definition
    
    // The capsule
    // Sort of long enough to loop via the repetiton
    float q = sdVerticalCapsule(p+vec3(.0,4.,.0),8.,.2);
    
    // A sphere and a Box Mixed
    // The 2.5 value makes "Knucklebones" 
    // The mix + sphere motion gives some "organic" feeling
    float m = 0.5*mix(sphere(p ,.55),box(p,vec3(0.5)),2.5);
    
 
    return min(q,m);

}

// Compute the normal vector at a position p on the surface of our objects
vec3 get_normal(vec3 p){

  // swizzling technics.
  // eps.xyy <=> vec3(0.001, 0.   , 0.)
  // eps.yxy <=> vec3(0.   , 0.001, 0.)
  // eps.yyx <=> vec3(0.   , 0.   , 0.001)
  vec2 eps = vec2(0.001,0.);
    return normalize(
             vec3(
                  SDF(p+eps.xyy) - SDF(p-eps.xyy), // Diff in X
                  SDF(p+eps.yxy) - SDF(p-eps.yxy), // Diff in Y
                  SDF(p+eps.yyx) - SDF(p-eps.yyx)  // Diff in Z
             )
            );  // Math Vector
}

// Lighting part, still confusing
float diffuse_directional(vec3 n,vec3 l,float d){
                                      //      ^ Not conventional but I needed it to change the lighing compare to the distance
    float a =  max(0.,dot(n,normalize(l))); // realistic lighting
    float b =  dot(n,normalize(l))*.5+.5;   // less realistic lighting
    return (a+b)/2.+0.1*abs(tan(d+iTime));  ; // Why not both ?
// Experimental ^ Average 
//                      ^ Wanted a sort of wave of light based on Z , 
//                        but the wavy things on Z changes the effect (still cool)
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = (fragCoord-.5*iResolution.xy)/iResolution.y;
    
    /* Camera Filter Effect */
    // Slice shift effect again but on X and Y to generate unaligned square
    uv.y += sign(sin(uv.x*50.))/100.* sin(uv.x*uv.x +uv.y*uv.y) ;//*sin(iTime*2.);
    uv.x += sign(cos(uv.y*50.))/100. * sin(uv.x*uv.x +uv.y*uv.y);//*cos(iTime*2.);
   
  
    // Ray origin / Ray direction
    vec3 ro = vec3(0.,0.,-5.); vec3 p = ro;
    vec3 rd = normalize(vec3(uv,0.6));
                             // ^ FOV / Zoom ?
    vec3 color = vec3(0.);
    
    bool hit = false;
    float shading = 0.; // Not used on seminar ?

    for(float i = -0.;i<200.;i++) { // March little ray, even if it's May
       float d = SDF(p);  // How far from my overall object
        if(d < 0.0001) {   // did it hit ?
        	hit = true;
            shading = i/100.;
            break;
       
        }
        p += d * rd;    // Ray is one step further
    }
    float t = length(ro-p);           
    if(hit) { // If it hits, need to color & light
         vec3 n = get_normal(p); 
         vec3 l = vec3(0.001,-1.5,-5.); // light origin 
          
         color =  vec3(diffuse_directional(n,l,t)); // light diffuse
         color = mix(vec3(0.1,0.2,0.3), vec3(0.999,0.6,0.45), color)*(1.-shading); 
        
    } else { // If not, it's darkness
        color = vec3(0.0);
    }
    
    // Creating some Fog
    color = mix(color,vec3(0.1,0.1,0.2),1.-exp(-0.0051*t*t)); 
    //                                             ^ Distance of fog 

    // "Vignetting" of the camera
    if(true){ // Original idea to create a Vignetting
    	color *= 1.-pow(length(uv)+0.05,2.);
    } else { // another intersting effect
    	color *= 1.-pow(length(uv),0.1);
   		color = smoothstep(0.001,0.07,color);
    }
    // Output to screen
    fragColor = vec4(color*1.4,1.0);
}
                    
