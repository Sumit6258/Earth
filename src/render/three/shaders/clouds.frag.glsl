uniform sampler2D cloudMap; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 N = normalize(vN), S = normalize(sunDir);
  float a = texture2D(cloudMap, vUv).r;
  float d = dot(N, S);
  float day = smoothstep(-0.10, 0.25, d);
  vec3 twilight = mix(vec3(1.0), vec3(1.0, 0.70, 0.50), exp(-d * d * 40.0) * 0.6);
  vec3 col = vec3(0.96, 0.97, 1.0) * (0.015 + 1.05 * day) * twilight;
  gl_FragColor = vec4(col, a * (0.12 + 0.88 * day) * 0.92);
  #include <colorspace_fragment>
}
