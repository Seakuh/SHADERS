// ShaderToy SoundCloud connection seems to be broken after a change on SoundCloud.
// https://www.reddit.com/r/soundcloud/comments/1cc4lv5/soundcloud_broken/?rdt=52620
//
// Invitation to Towel Day and the reveal of ShaderAmp 1.0 in c-base Berlin 2024-05-25
// 
// Event Page: https://logbuch.c-base.org/archives/5185
//
// Please press the ⏸→⏮→▶. button after the music started to play so that everything is in sync.
//
// You need to wait for audio to load and click pause/play on audio to make it work.
// There is a browser security feature which prevents audio playing before user interaction.
// So, if music doesnt play, interact with the page when it's loading.
//
// On YouTube: https://www.youtube.com/watch?v=NIeOzScDooI 
//
// Fork from Dot Music v0.32.231210 by QuantumSuper
// auto-vj of a rgb-shifted & morphing dot matrix reactive to sound & displaying characters
// 
// - use with music in iChannel0 -
//
// qr code example by MysteryPancake 
// https://www.shadertoy.com/view/flGyRD
// upside down QR code ¯\_(ツ)_/¯
const int pixels[] = int[](1,0,0,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,1,0,0,0,0,0,0,0,1, 1,0,1,1,1,1,1,0,1,1,0,0,1,1,0,1,1,0,1,0,1,1,1,1,1,0,1, 1,0,1,0,0,0,1,0,1,1,1,0,1,1,0,0,0,1,1,0,1,0,0,0,1,0,1, 1,0,1,0,0,0,1,0,1,1,1,1,1,0,0,0,1,1,1,0,1,0,0,0,1,0,1, 1,0,1,0,0,0,1,0,1,1,0,1,1,1,1,1,1,1,1,0,1,0,0,0,1,0,1, 1,0,1,1,1,1,1,0,1,1,1,0,0,1,0,1,1,0,1,0,1,1,1,1,1,0,1, 1,0,0,0,0,0,0,0,1,0,1,0,1,0,1,0,1,0,1,0,0,0,0,0,0,0,1, 1,1,1,1,1,1,1,1,1,0,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1, 1,0,0,1,0,0,1,0,1,1,0,0,1,1,1,1,0,1,1,0,1,1,1,1,1,0,1, 1,1,0,0,1,0,0,1,1,0,0,1,0,1,1,1,0,0,1,1,1,0,0,0,0,1,1, 1,1,0,1,0,0,1,0,0,0,1,0,0,1,1,1,0,0,0,0,0,0,1,0,1,0,1, 1,0,0,0,1,1,1,1,0,1,0,0,0,0,1,0,1,1,0,0,1,0,0,0,1,1,1, 1,0,0,1,1,1,0,0,0,1,0,1,0,0,1,0,1,0,0,0,1,1,0,1,1,1,1, 1,0,0,1,1,1,0,1,0,0,1,1,0,1,0,0,0,1,0,1,1,0,0,1,1,1,1, 1,0,0,0,1,0,1,0,1,0,1,0,1,0,0,1,0,0,1,0,1,1,1,0,0,0,1, 1,0,1,0,1,0,0,1,0,0,1,1,0,0,1,0,1,1,1,1,1,0,0,0,1,0,1, 1,0,1,0,1,1,0,0,0,1,0,1,0,0,1,1,0,0,0,0,0,0,0,0,1,0,1, 1,1,1,1,1,1,1,1,1,0,0,0,1,1,1,1,0,0,1,1,1,0,0,1,1,0,1, 1,0,0,0,0,0,0,0,1,1,0,0,0,1,0,0,1,0,1,0,1,0,0,0,1,0,1, 1,0,1,1,1,1,1,0,1,1,0,1,1,1,0,0,1,0,1,1,1,0,1,1,0,0,1, 1,0,1,0,0,0,1,0,1,0,1,0,0,0,1,1,0,0,0,0,0,0,0,1,0,1,1, 1,0,1,0,0,0,1,0,1,0,0,1,0,0,1,0,1,1,1,0,1,1,1,0,0,0,1, 1,0,1,0,0,0,1,0,1,1,0,0,0,1,1,0,0,1,1,1,0,0,0,1,0,0,1, 1,0,1,1,1,1,1,0,1,0,1,0,1,0,1,1,0,1,0,0,1,1,0,0,0,0,1, 1,0,0,0,0,0,0,0,1,0,1,0,0,0,1,1,0,0,0,0,1,0,0,0,1,0,1);
const float size = 27.0;
#define PI 3.14159265359 
#define aTime 150./20.*iTime
vec4 fft, ffts; //compressed frequency amplitudes
float warp; //screen warp factor
float sc; //max scale factor
int cnt;
void compressFft(){ //v1.2, compress sound in iChannel0 to simplified amplitude estimations by frequency-range
    fft = vec4(0), ffts = vec4(0);

	// Sound (assume sound texture with 44.1kHz in 512 texels, cf. https://www.shadertoy.com/view/Xds3Rr)
    for (int n=0;n<3;n++) fft.x  += texelFetch( iChannel0, ivec2(n,0), 0 ).x; //bass, 0-517Hz, reduced to 0-258Hz
    for (int n=6;n<8;n++) ffts.x  += texelFetch( iChannel0, ivec2(n,0), 0 ).x; //speech I, 517-689Hz
    for (int n=8;n<14;n+=2) ffts.y  += texelFetch( iChannel0, ivec2(n,0), 0 ).x; //speech II, 689-1206Hz
    for (int n=14;n<24;n+=4) ffts.z  += texelFetch( iChannel0, ivec2(n,0), 0 ).x; //speech III, 1206-2067Hz
    for (int n=24;n<95;n+=10) fft.z  += texelFetch( iChannel0, ivec2(n,0), 0 ).x; //presence, 2067-8183Hz, tenth sample
    for (int n=95;n<512;n+=100) fft.w  += texelFetch( iChannel0, ivec2(n,0), 0 ).x; //brilliance, 8183-44100Hz, tenth2 sample
    fft.y = dot(ffts.xyz,vec3(1)); //speech I-III, 517-2067Hz
    ffts.w = dot(fft.xyzw,vec4(1)); //overall loudness
    fft /= vec4(3,8,8,5); ffts /= vec4(2,3,3,23); //normalize
	
	//for (int n=0;n++<4;) fft[n] *= 1. + .3*pow(fft[n],5.); fft = clamp(fft,.0,1.); //limiter? workaround attempt for VirtualDJ
}

vec3 getCol(float id){ //v0.92, color definitions, for triplets
    vec3 setCol = vec3(0);
    id = mod(id,18.);
         if (id< 1.) setCol = vec3(244,  0,204); //vw2 pink
    else if (id< 2.) setCol = vec3(  0,250,253); //vw2 light blue
    else if (id< 3.) setCol = vec3( 30, 29,215); //vw2 blue
    else if (id< 4.) setCol = vec3(252,157,  0); //miami orange
    else if (id< 5.) setCol = vec3( 26,246,138); //miami green
    else if (id< 6.) setCol = vec3(131, 58,187); //nordic violet
    else if (id< 7.) setCol = vec3(231, 15, 20); //arena red
    else if (id< 8.) setCol = vec3( 35, 87, 97); //arena dark blue
    else if (id< 9.) setCol = vec3(103,211,225); //arena blue
    else if (id<10.) setCol = vec3(241,204,  9); //bambus2 yellow
    else if (id<11.) setCol = vec3( 22,242,124); //bambus2 green
    else if (id<12.) setCol = vec3( 30,248,236); //magic turquoise
    else if (id<13.) setCol = vec3(123, 23,250); //cneon pink
    else if (id<14.) setCol = vec3( 23,123,250); //cneon blue
    else if (id<15.) setCol = vec3( 73, 73,250); //cneon white
	else if (id<16.) setCol = vec3(173,  0, 27); //matrix red
    else if (id<17.) setCol = vec3( 28,142, 77); //matrix green
    else if (id<18.) setCol = vec3( 66,120, 91); //matrix green 2
    return setCol/256.;
}

float char(float c, vec2 p) { //get char from texture, source: https://www.shadertoy.com/view/MtySzd
    return texture( iChannel1, clamp(p,0.,1.)/16. + fract(floor(vec2( c, 15.999-float(c)/16.))/16.)).x;
}

mat2 rotM(float r){float c = cos(r), s = sin(r); return mat2(c,s,-s,c);} //2D rotation matrix

vec3 tmUnreal( vec3 c){return c / (c + .155) * 1.019;} //tone map, source: https://www.shadertoy.com/view/llXyWr

float aaStep( float fun){return smoothstep( max(fwidth(fun),.2*(1.-fft.x)), .0, fun);} //simple conditional antialiasing

float hash21(vec2 p){ //pseudorandom generator, cf. The Art of Code on youtu.be/rvDo9LvfoVE
    p = fract(p*vec2(13.81, 741.76));
    p += dot(p, p+42.23);
    return fract(p.x*p.y);
}

float drawCirc( vec2 p, float s){ //draw circles of dot matrix
    float aspect = length(iResolution.xy)/max(iResolution.x,iResolution.y); //aspect ratio corrector, 1..sqrt(2) for line..square
    p *= rotM(sin(aTime/64.*PI)*.05); //rotation effect
    float r = texelFetch( iChannel0, ivec2(512./aspect/cos(aspect*warp)*length(floor(p*s+.5)/s),0), 0 ).x; //grab audio amplitude
    return aaStep( length(fract(p*s-.5)-.5)-.45*r) //circle    
        //* (1.+9.*fft.y*step(fft.x,.92+fract(float(iFrame)*.5))*float( abs(floor(p.x*s+.5)*.5+floor(floor(p.y*s+.5)*sc)) ==  floor(fract(aTime/256.)*sc*sc*min(iResolution.x,iResolution.y)/max(iResolution.x,iResolution.y)) )) //running lights
        * (1.+9.*fft.y*step(fft.x,.92)*float( abs(floor(p.x*s+.5)*.5+floor(floor(p.y*s+.5)*sc)) ==  floor(fract(aTime/256.)*sc*sc*min(iResolution.x,iResolution.y)/max(iResolution.x,iResolution.y)) )) //running lights
        * step( .02, fract(p.x*s-.5)*fract(p.y*s-.5)*fract(-p.x*s-.5)*fract(-p.y*s-.5)); //ugly singularity fix
}

void mainImage( out vec4 fragColor, in vec2 fragCoord){
    // General initialization
    vec2 uv = (2.*fragCoord-iResolution.xy) / max(iResolution.x, iResolution.y); //long edge -1 to 1, square aspect ratio
    vec2 v = vec2(1,0); //utility
    compressFft(); //initializes fft, ffts
        
    // Base settings
    warp = 1.0*fft.w; //warp factor
    uv *= cos(length(uv*warp)); //screen warp effect
    sc = 190.; //max scale factor
    //float scale = (.6-.4*cos(aTime/64.*PI)) * sc;
    float scale = ((sin(fft.w)*.55+0.3)-.3*cos(aTime/64.*PI)) * sc;

    // Draw dot matrix
    vec3 col = vec3(0) + 
        v.xyy * drawCirc( uv, scale     ) + //r
        v.yxy * drawCirc( uv, scale*1.01) + //g
        v.yxy * drawCirc( uv, scale*1.02);  //b
    
    // Overlay characters
    vec2 offset = vec2(.5) + mix(.0,.01-.02*hash21(fft.yz),fft.z*fft.z*2.-1.); //char pos + shake
    scale *= .04; //char scale
    //float myString = (fract(aTime/256.)<.5)?
    cnt = 0;
    float myString=0.;
    if (iTime>36.5){
    	vec2 uv = vec2(0.5) + (fragCoord - 0.5 * iResolution.xy) / min(iResolution.x, iResolution.y);
        if (abs(uv.x - 0.5) < 0.5) {
            float coord = (uv.x + floor(uv.y * size)) * size;
            fragColor = vec4(vec3(pixels[int(coord)]), 1.0);
        } else {
            fragColor = vec4(0.0);
        }
    }else {
    
    float myString = (fract(aTime/240.)<.5)?
        
        (aTime>10.0 && aTime < 60.)?
        char(84., uv*scale+offset+v*1.75) +
        char(111., uv*scale+offset+v*1.25) +
        char(119., uv*scale+offset+v*.75) +
        char(101., uv*scale+offset+v*.25) +
        char(108., uv*scale+offset-v*.25) +
        char(68., uv*scale+offset-v*.75) +
        char(97., uv*scale+offset-v*1.25) +
        char(121., uv*scale+offset-v*1.75) //TowelDay
        
        :
        (aTime>60.0 && aTime < 77.)?
        char(38., uv*scale+offset+v*.0) //& = 38
        :
        
        ((fract(aTime/240.)>.36 &&fract(aTime/240.)<.5) || (fract(aTime/240.)>.27 &&fract(aTime/240.)<.32))?
        char( 100., uv*scale+offset+v*.5) +
        char( 101., uv*scale+offset+v*.0) +
        char( 114., uv*scale+offset-v*.5): //der
        char( 83., uv*scale+offset+v*2.0) +
        char( 104., uv*scale+offset+v*1.5) +
        char( 97., uv*scale+offset+v*1.) +
        char( 100., uv*scale+offset+v*.5) +
        char( 101., uv*scale+offset+v*.0) +
        char( 114., uv*scale+offset-v*.5) +
        char( 65., uv*scale+offset-v*1.) +
        char( 109., uv*scale+offset-v*1.5) +
        char( 112., uv*scale+offset-v*2.) : // "ShaderAmp
        
            (fract(aTime/240.)>.8 &&fract(aTime/240.)<.85)?
            char( 66., uv*scale+offset+v*1.25) +
            char( 101., uv*scale+offset+v*.75) +
            char( 114., uv*scale+offset+v*.25) + 
            char( 108., uv*scale+offset-v*.25) +
            char( 105., uv*scale+offset-v*.75) +
            char( 110., uv*scale+offset-v*1.25): // BERLIN
            
            (fract(aTime/240.)>.85)?
                char( 50., uv*scale+offset+v*2.25) +
                char( 48., uv*scale+offset+v*1.75) + 
                char( 50., uv*scale+offset+v*1.25) +
                char( 52., uv*scale+offset+v*.75) + 
                char( 45., uv*scale+offset+v*.25) + 
                char( 48., uv*scale+offset-v*.25) + 
                char( 53., uv*scale+offset-v*.75) + 
                char( 45., uv*scale+offset-v*1.25) +
                char( 50., uv*scale+offset-v*1.75) +
                char( 53., uv*scale+offset-v*2.25): // 2024-05-25
                
               (fract(aTime/240.)<.65 &&fract(aTime/240.)>.6)?
                   (fract(aTime/240.)<.64 &&fract(aTime/240.)>.63) ?
                    char( 60., uv*scale+offset+v*.25) +
                    char( 51., uv*scale+offset-v*.25): // <3
                    char(64., uv*scale+offset+v*.0): // @     
                    
                    (fract(aTime/240.)>.5 &&fract(aTime/240.)<.6)?
                    char( 66., uv*scale+offset+v*.75) +
                    char( 65., uv*scale+offset+v*.25) +
                    char( 83., uv*scale+offset-v*.25) +
                    char( 83., uv*scale+offset-v*.75): // BASS
                    char( 99., uv*scale+offset+v*1.25) +
                    char( 45., uv*scale+offset+v*.75) +
                    char( 98., uv*scale+offset+v*.25) +
                    char( 97., uv*scale+offset-v*.25) +
                    char( 115., uv*scale+offset-v*.75) +
                    char( 101., uv*scale+offset-v*1.25);// c-base 
        
        
        
    float amp = (fft.x>.97)? fract(float(iFrame)*.5)*22. : 1.; //char strobo
    col *= .05 + .95*mix( 1., amp*myString, clamp(fft.x/.92,.0,1.)); //overlay string

    // Finalization
    float colId = 3. * floor(aTime/32.); //color set id
    col = mat3( getCol( colId+0.), getCol( colId+1.), getCol( colId+2.)) * col * (.1+.9*ffts.xyz/max(.001,max(ffts.x,max(ffts.y,ffts.z)))); //remap colors
    col = tmUnreal( col); //tone map & gamma
	col -= length(uv) * fft.z * .2; //vignette
    fragColor = vec4(col,1.); //output
    }
}
