//declare variable controlling the number of circles being drawn.
float rep;

void draw() {
  background(0);
  stroke(255);
  noFill();
  strokeWeight(1);
  randomSeed(500000);

  //translate(width/2, height/2);
  //begin recording vertices for a shape.
  //loop allowing the generation of rings, specifying their quantity, consecutive increase in radius & in "noiseScale".
  for (rep=0; rep<100; rep++) {
    r+=2;
    noiseScale+=0.00005;
    
    beginShape();
    //loop increment must be adequately small so that the shape is closed.
    for (a=0; a<TWO_PI; a+=0.01) {
      //translation from polar to cartesian coordinates. could also be "x = width/2 + r*cos(a)" instead of a translation before "endShape" to centre the image.
      x=width/2 + r*cos(a);
      //apply perlin noise to x-coordinate. a large number is added to avoid noise generating symmetrical patterns     (it does so as perlin noise is mirrored around 0.
      x += map(noise(noiseScale*x+100000, noiseScale*y+100000, 0), 0, 1, -noiseAmount, noiseAmount);
      //translation from polar to cartesian coordinates. could also be "y = height/2 + r*sin(a)" instead of a translation before "endShape" to centre the image.
      y=height/2 + r*sin(a);
      //apply perlin noise to y-coordinate. a large number is added to avoid noise generating symmetrical patterns (it does so as perlin noise is mirrored around 0.
      y += map(noise(noiseScale*x+100000, noiseScale*y+100000, 1), 0, 1, -noiseAmount, noiseAmount);
      //specify coordinates for the vertices.
      vertex(x, y);
    }
    endShape();
  }

  //end recording vertices for a shape.
  
  save("perlin_test.jpg");
}
