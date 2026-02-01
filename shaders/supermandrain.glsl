// variant of https://www.shadertoy.com/view/4sGXDK
// compact version of https://www.shadertoy.com/view/4dcSWs

void mainImage(out vec4 O,  vec2 U){

    vec2 z = iResolution.xy;                                // normalized coordinates
         U = (U+U - z) / z.y;
    
	z = U - vec2(-1,0);  U.x -= .5;                         // Moebius transform
    U *= mat2(z,-z.y,z.x) / dot(U,U);
    U+=.5;  // offset. not included as length(U+=.5) because of an ATI bug
    
                     //  spiral, zoom       phase     // spiraling
    U =   log(length(U))*vec2(.5, -.5) + iTime/8.
        + atan(U.y, U.x)/6.3 * vec2(5, 1);        
	                                 // n  
  //O += length(fract(U*3.)) -O;
  //O  = texture(iChannel0, fract(U*3.));  // U*1. is also nice
  //O += length(sin(U*30.)) -O;
    O = .5+.5*sin(6.*3.14*U.y+vec4(0,2.1,-2.1,0));
                 // try also U.x
  //O /= max(O.x,max(O.y,O.z)); // saturates the rainbow
}