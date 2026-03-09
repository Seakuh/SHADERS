// Created by greenbird10
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0


//From Dave (https://www.shadertoy.com/view/4djSRW)
vec2 hash(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(443.897, 441.423, 437.195));
    p3 += dot(p3.zxy, p3.yxz+19.19);
    return fract(vec2(p3.x * p3.y, p3.z*p3.x))*2.0 - 1.0;
}

//From iq (https://www.shadertoy.com/view/XdXGW8)
float noise( in vec2 p )
{
    vec2 i = floor( p );
    vec2 f = fract( p );
	
	vec2 u = f*f*(3.0-2.0*f);

    return mix( mix( dot( hash( i + vec2(0.0,0.0) ), f - vec2(0.0,0.0) ), 
                     dot( hash( i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
                mix( dot( hash( i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ), 
                     dot( hash( i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
}


#define reedN 120.
void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = fragCoord/iResolution.xy;
    vec2 w = 1./iResolution.xy;
    
    // reeds
    const float reedW = 0.015;
    const float blur = 0.015;
    float recordA = 0.;
    float recordS = 0.;
    vec2 reedUV = vec2(0.,1.);
    for (float i = 0.; i < reedN; i++)
    {
        float s = texture(iChannel0, vec2(i/reedN, 0.13)).r;
        s = s * 1.4 - 0.2;
        float h = texture(iChannel0, vec2(i/reedN, 0.5)).r;
        h *= ((1.0 - uv.x) * 0.4 + 0.7);
        float w = texture(iChannel0, vec2(i/reedN, 0.9)).r;
        w = reedW * (w*0.01+1.0);
        
        // width
        float widthF = 0.8;
        float yh = 1. - max((uv.y - (h-widthF)), 0.)/widthF;
        yh = pow(yh, 0.4);

        // wind
        float wind = pow(uv.y+0.5, 2.0) * (sin(iTime + uv.x*3.0) + 1.0) * 0.05;
        // bent1
        float bentF = 1.5 * h;
        float bent1 = pow(max((uv.y - (h - bentF)), 0.)/bentF, 4.) * 0.1;
        // alpha
        float uvx = uv.x - bent1 - wind;
        float a = smoothstep(w*yh, w*yh-blur, abs(uvx - s));
        a *= smoothstep(h, h-blur, uv.y);
        
        //uv
        if(abs(uvx - s) < w*yh && a > recordA)
        {
            // alpha blending
            reedUV.x = reedUV.x*recordA + (1.-recordA)*(uvx-s+w*yh)/(w*yh*2.);
            reedUV.y = min(reedUV.y, uv.y/h);
            recordS = recordS*recordA + (1.-recordA)*s;
            recordA = a;
        }
    }
    
    
    // water
    vec3 col = vec3(102./255., 120./255., 133./255.);
    vec3 col1 = vec3(165./255., 157./255., 152./255.);
    
    vec2 st = uv * vec2(iResolution.x/iResolution.y, 1.);
    float sun = distance(st, vec2(1.5, 0.9));
    sun = pow(sun, 1.7);
    col = mix(col, col*1.2, sun);
    col1 = mix(col1, col1*1.5, sun);
    
    col = mix(col1, col, smoothstep(
    0.4, 0.9, uv.y + 0.5 * noise(vec2(
    (uv.x + 0.3 * noise(vec2(uv.y * 30., 0.17 + iTime*0.5))) * 4., 0.33 + iTime*0.1))));
    
    
    // reed
    vec3 reedCol = mix(
        vec3(185./255., 134./255., 102./255.),
        vec3(249./255., 218./255., 179./255.),
        noise(vec2(recordS * 15.337, 0.1177)));
    reedCol = mix(reedCol, reedCol*1.3, sun);
    col = mix(col, reedCol, recordA);
    
    
    // Output to screen
    fragColor = vec4(col,1.0);
}