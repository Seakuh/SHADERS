// Inspired by a discussion on hackaday at:
// https://hackaday.com/2021/04/13/alien-art-drawn-with-surprisingly-simple-math/
// Formula shared by "Joe" on that page..

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Scale and move to make things a litle more interesting t look at.
    float scale = 0.2;
    float trans = iTime * 25.0;
    vec2 coord = (scale * fragCoord) + vec2(trans,0.0);
    
    // Heart of color selection.
    int val = ((int(coord.x) & int(coord.y)) % 3);
    float result = 0.0;
    vec3 col = vec3(0.0);
    for(int i = 0; i < 6; i++){
        coord.y -= (3.0-result);
        coord = coord/(2.0);
        result = ((result + float(val = ((int(coord.x-coord.y) & int(coord.y+coord.x*2.0)) % 3)))/(2.0));
        col.x = (result*2.0+col.z)/3.0;
        col = col.yzx;
    }
    // Output.
    fragColor = vec4((col/2.0),0.0);
}