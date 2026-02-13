#define iTime (iTime + 10.)
float map(vec2 uv, float t)
{
    float c = cos(t), s = sin(t);
    mat2 R = mat2(c,s,-s,c);

    vec2 a = R*vec2(-2,0);
    vec2 b = R*vec2(2,0)-a;
    vec2 p = uv-a;
    
    float sdf = 
    mix(
        
        length(clamp(dot(p, b)/dot(b,b), 0., 1.)*b - p),
        length(clamp(round(dot(p, b)/dot(b,b)*30.)/30., 0., 1.)*b - p)
        , .5+.5*tanh(10.*sin(iTime*.1))
    )
    ;
    return sdf;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (2. * fragCoord - iResolution.xy)/iResolution.y;
    float ps = .75*2. / iResolution.y;
    
    vec3 color = vec3(0);
    
    vec2 tex_uv = uv;

    float speed = 2.;
    float t = iTime*speed;
    
    t -= mix(log2(dot(uv,uv)), dot(uv,uv), .5+.5*tanh(4.*sin(iTime*.25)));
    
    float index = 0.;
    for(float j = 0.;  j < 8.; j++) 
    {
        
        vec2 uv2 = 2.*tex_uv;
    
        // Apply translate, rotate and zoom
        const float PI = 3.14159265;
        float angle = 2.*PI * .01 * t;
        float c = cos(angle), s = sin(angle);
        mat2 R = mat2(c,s,-s,c);

        tex_uv = sqrt(tex_uv*tex_uv + 0.0005);

        tex_uv += 0.1 + cos(t*.33)*.05;

        tex_uv = asin(sin(tex_uv));
        
        float scale = (1.05 + sin(t*.1) * .05);
        scale /= (0.00001+dot(tex_uv, tex_uv));
        tex_uv *= scale;
        ps *= scale;
        
        tex_uv *= R;

        for(float j = 0.01; j < 1.; j += j)    tex_uv += cos(tex_uv.yx * j)/j*.005;
        
        float sdf2 = map(uv2, t);
        vec3 col = vec3(0);
        
        // Using this for coloring
        index *= 4.;
        index += 2. * smoothstep(-.05,.05, tex_uv.y) + smoothstep(-.05, .05, tex_uv.x);

        for(float i = 0.01; i < 1.024; i+=i)
        {
            t -= sdf2*i;
            sdf2 = map(uv2, t);
            float a = 0.01/(0.001+ sdf2);
            vec3 cmap = (.5+.5*cos(index/32. + t*.25 + vec3(3,2,1)));
            col += a * cmap;
        }
        
        color += col * exp2(-12.*smoothstep(2., 14., j));

    }
    
    color *= pow(abs(color), vec3(.85));
    color = 1.-exp(-color);
    color = mix(
    12.92 * color,
        pow( 1.055 * color, vec3( 1.0 / 2.4 ) ) - 0.055,
        step( 0.0031308, color )
      );
    fragColor = vec4(color, 1);
}