#define repeat(v, r) (mod(v, r)-r/2.)

struct Shape{
  float dist;
  vec4 color;
};


    
//=======================
// Utility Functions
//=======================
float random(vec2 v) {
  return fract(sin(dot(v*0.1, vec2(324.654, 156.546)))*46556.2);
}

mat2 rot(float a){
  float r = tan(a)+1.;
  float f = cos(a);
  return mat2(r, f, -f, r);
}


float pole(vec2 v, float r){
  return length(v)-r;
}
float sphere(vec3 v, float r){
  return length(v)-r;
}
float box(vec3 v, float r, float m) {
  return max(length(v.xy)-r, abs(v.z)-m);
}



float mixColors(float r, float v, float z){
  return clamp(0.5+0.5*(v-r)/z, 0., 1.);
}

float mixShapes(float v, float f, float r){
  float z = mixColors(v, f, r);
  return mix(f,v,z)-r*z*(1.-z);
}

float pModPolar(inout vec2 v, float r){
  float f = 6.28318/r;
  float z = atan(v.y, v.x)+f*0.5;
  float m = floor(z/f);
  z = mod(z, f)-f*0.5;
  v = vec2(cos(z), sin(z))*length(v);
  return m;
}
//=======================

Shape vines(vec3 c){
  Shape shape;
  float vine;
  shape.dist = 1000.; // Draw Distance
  shape.color = vec4(1.); // Initial Color

  // Shape Attributes
  float twist = 10.; // Vine Repeat
  float vineOffset = 3.; // Leaf Offset


	vineOffset += cos(iTime*0.5)*1.;

  // Stems
  vec3 i = c;
    i.xz *= rot(c.y*.5+cos(iTime)*0.25);
    float detail = pModPolar(i.xz, twist); 
    
    float x = mix(-2., 1., mod(detail, 10.));// Small Ripples
    //float x = mix(0., 1., pModPolar(i.xy, 10.)); 
    
    i.x = abs(i.x)-cos(iTime); //mirror
    i.x -= vineOffset; // Offset Stems
  	float stemWidth = 0.25; //width
  	vine = pole(i.xz, stemWidth+0.02*sin(i.y*x));


  vec4 color = vec4(.05, 0., .5+cos(iTime)*.5, 1.); //color
    
    float pattern = (tan(c.z*10.)*.3) +
        cos(sin(c.x*2.)); //pattern of stem

  shape.dist = vine;
  shape.color = color;
  shape.color *= pattern;

  return shape;
}


Shape orb(vec3 c){
  Shape shape;
  float orb;
  shape.dist = 1000.; // Draw Distance
  shape.color = vec4(1.); // Initial Color

  // Stems
  vec3 i = c;
    i.xz *= rot(iTime); //rotation along x and z
    i.y = repeat(i.y, 0.5); //repeat in y
    i.x = abs(i.x)-0.5; //mirror in x
    i.z = abs(i.z)-0.5; //mirror in z
    orb = sphere(i, cos(sin(iTime)*2.)*0.25);
    

  vec4 color = vec4(3., 2.5, 0.4, 1.); //color

  shape.dist = orb;
  shape.color = color;

  return shape;
}


Shape map(vec3 c){
  Shape vines = vines(c);
  Shape orbs = orb(c);
    
  float df = mixShapes(vines.dist, orbs.dist, 1.);
  vines.dist = df;
    
  vines.color = mix(vines.color, 
                    orbs.color, 
                    mixColors(orbs.dist, vines.dist, 1.));

  return vines;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  vec2 v = (fragCoord.xy-0.5 * iResolution.xy) / iResolution.y;

  
  vec3 cam = vec3(0., 0., -10.);
  vec3 f = normalize(vec3(v, 1.));
  vec3 scene = cam;
  fragColor = vec4(cos(iTime)*.1,cos(iTime)*.1,cos(iTime)*.5, 1.);

  // Ray Marcher
  for(float z = 0.1 ; z <= 1.; z += 0.05){
    Shape c = map(scene); // Calc SDF
    if(c.dist < 0.01){
      fragColor = c.color*(1.-z); // Hit  - invert pixels
      break;
    }
    c.dist  *= smoothstep(0., 1., length(v.y/v.x)); //smoothstep in middle of screen
    // Output to screen
    scene += f * c.dist;


  }
}
