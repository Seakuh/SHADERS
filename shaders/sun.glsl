#define N 20.
void mainImage( out vec4 o, vec2 u ) {
    u = (u+u-(o.xy=iResolution.xy))/o.y;
    //vec2 R=iResolution.xy;
    //u = (u+u -R)/R.y;
    float t = iTime,
          r = length(u), a = atan(u.y,u.x);
    // r *= 1.-.1*(.5+.5*cos(2.*r*t));
    float i = floor(r*N);
    a *= floor(pow(128.,i/N)); 	 a += 10.*t+123.34*i;
    r +=  (.5+.5*cos(a)) / N;    r = floor(N*r)/N;
	o = (1.-r)*vec4(3,2,1,1);
}