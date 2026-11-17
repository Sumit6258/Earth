uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir; uniform float hasNight;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main() {
  vec3 N = normalize(vN), S = normalize(sunDir);
  vec3 albedo = texture2D(dayMap, vUv).rgb;
  float d = dot(N, S);
  float day = smoothstep(-0.06, 0.20, d);
  vec3 twilight = mix(vec3(1.0), vec3(1.0, 0.72, 0.52), exp(-d * d * 40.0) * 0.5);
  vec3 col = albedo * (0.02 + 1.05 * day) * twilight;
  if (hasNight > 0.5) {
    vec3 nl = texture2D(nightMap, vUv).rgb;
    float l = dot(nl, vec3(0.299, 0.587, 0.114));
    col += nl * smoothstep(0.03, 0.25, l) * (1.0 - day) * 1.6 * vec3(1.0, 0.82, 0.58);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
