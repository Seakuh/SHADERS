
#define T iTime
#define PI 3.141596
#define TAU 6.283185
#define S smoothstep
#define s1(v) (sin(v)*.5+.5)

vec3 palette( in float t )
{
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.1, 0.2);
  return a + b*cos( 6.283185*(c*t+d) );
}

float hash(vec2 p){
  return fract(sin(dot(p, vec2(456.456,7897.7536)))*741.25639);
}

vec2 randomGradient(vec2 p){
  float a = hash(p)*TAU;
  return vec2(cos(a), sin(a));
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);

  vec2 g00 = randomGradient(i+vec2(0,0));
  vec2 g10 = randomGradient(i+vec2(1,0));
  vec2 g01 = randomGradient(i+vec2(0,1));
  vec2 g11 = randomGradient(i+vec2(1,1));

  float v00 = dot(g00, f-vec2(0,0));
  float v10 = dot(g10, f-vec2(1,0));
  float v01 = dot(g01, f-vec2(0,1));
  float v11 = dot(g11, f-vec2(1,1));

  vec2 u = smoothstep(0.,1.,f);

  return mix(mix(v00,v10,u.x), mix(v01,v11,u.x), u.y);
}

float fbm(vec2 p){
  float amp = 1.;
  float n = 0.;
  for(float i =0.;i<2.;i++){
    n += noise(p)*amp;
    amp *= .5;
    p *= 2.;
  }
  return n;
}


void mainImage(out vec4 O, in vec2 I){
  vec2 R = iResolution.xy;
  vec2 uv = (I-R*.5)/R.y;
  vec2 m = (iMouse.xy*2.-R)/R * PI * 2.;

  O.rgb *= 0.;
  O.a = 1.;


  vec3 col = vec3(0);
  float t = T*.8;

  uv = vec2((atan(uv.y,uv.x)+PI)/TAU, length(uv));
  float gradient = S(0.,.1,uv.x) * S(1.,.9,uv.x); // 消除接缝

  float n1 = noise(uv*2.+vec2(0, mod(t*.6, 100.)));
  vec2 uv2 = uv + n1;

  vec2 uv3 = mix(uv, uv2, .1)*6.;

  float n = fbm(uv3*vec2(3.2,.5)+vec2(0, -mod(t*3., 100.)));

  float mask_gradient = S(.04,.2,uv.y) * S(.5,.35, uv.y);
  n *= 2.5;
  n *= mask_gradient;


  n *= gradient;
  // vec3 c = mix(vec3(1,2,3), vec3(6,3,1), n);
  vec3 c1 = palette(s1(T+2.3))*10.;
  vec3 c2 = palette(s1(T+3.5))*10.;
  // vec3 c = mix(c1,c2,clamp(n*.4, 0., 1.));
  vec3 c = mix(c1,c2,n);

  col = n*c;

  col = tanh(col/2.);

  O.rgb = col;
}