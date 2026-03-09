#define SIDES 3.0
#define SPEED 0.7
#define SCALE 2.0

float polygon(vec2 p, float n)
{
    float a = atan(p.y,p.x);
    float r = length(p);

    float k = 6.28318530718 / n;
    return cos(floor(0.5 + a/k)*k - a) * r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord - 0.5*iResolution.xy) / iResolution.y;

    float t = iTime * SPEED;

    float zoom = pow(SCALE, t);
    uv *= zoom;

    float level = floor(log(length(uv)) / log(SCALE));

    vec2 p = uv / pow(SCALE, level);

    float d = polygon(p, SIDES);

    float shape = step(d, 0.4);

    float col = mod(level,2.0)==0.0 ? shape : 1.0-shape;

    fragColor = vec4(vec3(col),1.0);
}