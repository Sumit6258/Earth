uniform vec3 sunDir; uniform float exposure;
varying vec3 vW;
void main() {
  gl_FragColor = atmosphere(cameraPosition, normalize(vW - cameraPosition), normalize(sunDir), exposure);
}
