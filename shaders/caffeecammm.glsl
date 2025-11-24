void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord/iResolution.xy+0.5;
    vec2 muv = iMouse.xy/iResolution.xy;
    
    vec3 col;
    col = texture(iChannel0, fract(uv-0.5)).xyz;
    
    float avg = (col.x+col.y+col.z)/3.0;
    float steps = 10.0;
    float n = floor(avg * steps);
    uv += (iTime)/10.0*n;
    
    col = texture(iChannel0, fract(uv-0.5)).xyz;
    //col = vec3(fract(uv-0.5), 0.0);
    
    fragColor = vec4(col,1.0);
}