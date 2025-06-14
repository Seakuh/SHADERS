vec2 hash (in vec2 p) {
  p = vec2 (dot (p, vec2 (127.1, 311.7)),
            dot (p, vec2 (269.5, 183.3)));

  return -1. + 2.*fract (sin (p)*43758.5453123);
}

float noise (in vec2 p) {
  const float K1 = .366025404;
  const float K2 = .211324865;

  vec2 i = floor (p + (p.x + p.y)*K1);
   
  vec2 a = p - i + (i.x + i.y)*K2;
  vec2 o = step (a.yx, a.xy);    
  vec2 b = a - o + K2;
  vec2 c = a - 1. + 2.*K2;

  vec3 h = max (.5 - vec3 (dot (a, a), dot (b, b), dot (c, c) ), .0);

  vec3 n = h*h*h*h*vec3 (dot (a, hash (i + .0)),
                         dot (b, hash (i + o)),
                         dot (c, hash (i + 1.)));

  return dot (n, vec3 (70.));
}

float fbm(vec2 pos, float tm)
{
    vec2 offset = vec2(cos(tm), 0.0);
    float aggr = 0.0;
    
    aggr += noise(pos);
    aggr += noise(pos + offset) * 0.5;
    aggr += noise(pos + offset.yx) * 0.25;
    aggr += noise(pos - offset) * 0.125;
    aggr += noise(pos - offset.yx) * 0.0625;
    
    aggr /= 1.0 + 0.5 + 0.25 + 0.125 + 0.0625;
    
    return (aggr * 0.5) + 0.5;    
}

vec3 lightning(vec2 pos, float offset)
{
    vec3 col = vec3(0.0);
    vec2 f = vec2(0.0, -iTime * 0.25 );
    
    for (int i = 0; i < 3; i++)
    {
        float time = iTime +float(i);
        float d1 = abs(offset * 0.03 / (0.0 + offset - fbm((pos + f) * 3.0, time)));
        float d2 = abs(offset * 0.03 / (0.0 + offset - fbm((pos + f) * 2.0, 0.9 * time + 10.0)));
        col += vec3(d1 * vec3(0.1, 0.3, 0.8));
        col += vec3(d2 * vec3(0.7, 0.3, 0.5));
    }
    
    return col;
}

/*
float distanceCodebaseAlpha(vec2 pos)
{
    ivec2 siz = textureSize(iChannel0, 0);
    pos.x *= float(siz.y)/float(siz.x);
    pos.y *= -1.0;
    pos += vec2(0.5);
    vec4 col = texture(iChannel0, pos);
    float d = col.x + col.y/256.0 + col.z/(256.0 * 256.0);
    
    return -2.0 * d + 1.0;
}
*/

float distanceCodebaseAlpha(vec2 pos)
{
    return length(pos) - 0.5;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = -1. + 2. * fragCoord / iResolution.xy;
    uv.x *= iResolution.x / iResolution.y;
    uv *= 0.5;
    //float dist = length(uv) - 0.25;
    float dist = distanceCodebaseAlpha(uv);
    
    vec3 n = lightning(uv, dist + 0.4);
    vec3 col = vec3(0.0);
    
    col += n;
    col += 0.5 * smoothstep(0.01, -0.01, dist) * sqrt(smoothstep(0.25, -0.5, dist));
    col += 0.25 * smoothstep(0.1, 0.0, dist);
    
    
    fragColor = vec4(col, 1.0);
}






