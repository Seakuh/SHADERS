// Day 1: Get some basic raymarcher working. 
// Or... no, let's do some kind of fake bokeh thing, I've not done that before.

// A camera. Has a position and a direction. 
struct Camera {
    vec3 pos;
    vec3 dir;
};
    
// A ray. Has origin + direction.
struct Ray {
    vec3 origin;
    vec3 dir;
};
    
// A disk. Has position, size, colour.
struct Disk {
    vec3 pos;
    float radius;
    vec3 col;
};
        
    vec4 intersectDisk(in Ray ray, in Disk disk, in float focalPoint) {
        // Move ray to Z plane of disk
        ray.origin += ray.dir * disk.pos.z;
        
        // Find distance from ray to disk (only xy needs considering since they have equal Z)
        float dist = length(ray.origin.xy - disk.pos.xy);
        
        // blur depends on distance from focal point
        float blurRadius = abs(focalPoint - disk.pos.z) * 0.1;
        
        // Calculate alpha component, using blur radius and disk radius
        float alpha = 1. - smoothstep(max(0., disk.radius - blurRadius), disk.radius + blurRadius, dist);
       
        // Limit to 50% opacity
        alpha *= 0.3;
       	
        // Pre-multiply by alpha and return
        return vec4(disk.col * alpha, alpha);
    }

// Normalised random number, borrowed from Hornet's noise distributions: https://www.shadertoy.com/view/4ssXRX
float nrand( vec2 n )
{
	return fract(sin(dot(n.xy, vec2(12.9898, 78.233)))* 43758.5453);
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // We'll need a camera. And some perspective.
    
	// Get some coords for the camera angle from the frag coords. Convert to -1..1 range.
    vec2 uv = fragCoord.xy / iResolution.xy;
    uv = uv * 2. - 1.;
    
    // Aspect correction so we don't get oval bokeh
    uv.y *= iResolution.y/iResolution.x;
    
    // Make a camera at 0,0,0 pointing forwards
    Camera cam = Camera(vec3(0, 0, 0.), vec3(0, 0, 1));
                        
    // Find the ray direction. Simple in this case.
    Ray ray = Ray(cam.pos, normalize(cam.dir + vec3(uv, 0)));
    
    // Cast the ray into the scene, intersect it with bokeh disks.
    // I'm using a float since the loop is simple and it avoids a cast (costly on some platforms)
    const float diskCount = 100.;
    
    // Set the focal point
    float focalPoint = 2.0;
    
    // Create an empty colour
    vec4 col = vec4(0.);
    
    float time = iTime * 0.1;
    
    for (float i=0.0; i<diskCount; i++) {
        // random disk position
        vec3 diskPos = vec3(
            sin(i*(nrand(vec2(i-3., i + 1.)) + 1.) + time),
            sin(i*(nrand(vec2(i-2., i + 2.)) + 2.) + time * 0.9), 
            sin(i*(nrand(vec2(i-1., i + 3.)) + 2.) + time * 0.9) * 5. + 5.5
            );
        
        // Scale x+y by z so it fills the space a bit more nicely
        diskPos.xy *= diskPos.z*0.7;
        
        // random disk colour
        vec3 diskCol = vec3(
            sin(i) * 0.25 + 0.75,
            sin(i + 4.) * 0.25 + 0.55,
            sin(i + 8.) * 0.25 + 0.65
        );
        
        // random disk size
        float diskSize = nrand(vec2(i)) * 0.2 + 0.1;
        
        // create the disk
        Disk disk = Disk(diskPos, diskSize, diskCol);
        
        // Intersect the disk
        vec4 result = intersectDisk(ray, disk, focalPoint);
        
        // Add the colour in
       col += result;
    }
    
	fragColor = vec4(col.rgb,1.0);
}