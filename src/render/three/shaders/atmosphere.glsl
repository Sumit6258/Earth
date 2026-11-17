// Single-scattering atmosphere (Rayleigh + Mie), ray-marched. Pure functions, no Three.js specifics.
// Units: 1.0 = Earth equatorial radius (6378.137 km). Needs: #define VS (view samples) and #define LS (light samples).
const float A_PI = 3.14159265359;
const float RP = 0.99888;                          // mean planet radius, 6371 km
const float RA = 1.01456;                          // top of atmosphere, +100 km
const float HR = 0.0012543;                        // Rayleigh scale height, 8.0 km
const float HM = 0.00018814;                       // Mie scale height, 1.2 km
const vec3 BETA_R = vec3(36.99, 86.10, 211.13);    // Rayleigh scattering per unit (5.8, 13.5, 33.1 per Mm)
const float BETA_M = 133.94;                       // Mie scattering per unit (21 per Mm)
const float MIE_G = 0.76;
const float SUN_I = 20.0;

vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, h = b * b - c;
  if (h < 0.0) return vec2(-1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// Premultiplied in-scattered colour (rgb) and 1 - mean transmittance (a) along a view ray.
vec4 atmosphere(vec3 ro, vec3 rd, vec3 S, float exposure) {
  vec2 ta = raySphere(ro, rd, RA);
  if (ta.y <= 0.0) return vec4(0.0);
  float t0 = max(ta.x, 0.0), t1 = ta.y;
  vec2 tp = raySphere(ro, rd, RP);
  if (tp.x > 0.0) t1 = min(t1, tp.x);
  float seg = (t1 - t0) / float(VS);
  float mu = dot(rd, S);
  float phR = 3.0 / (16.0 * A_PI) * (1.0 + mu * mu);
  float g2 = MIE_G * MIE_G;
  float phM = 3.0 / (8.0 * A_PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * MIE_G * mu, 1.5));
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0, tc = t0 + 0.5 * seg;
  for (int i = 0; i < VS; i++) {
    vec3 p = ro + rd * tc;
    float h = max(length(p) - RP, 0.0);
    float dR = exp(-h / HR) * seg, dM = exp(-h / HM) * seg;
    odR += dR; odM += dM;
    if (!(raySphere(p, S, RP).x > 0.0)) {           // not in the planet's shadow
      float segL = raySphere(p, S, RA).y / float(LS);
      float lR = 0.0, lM = 0.0, tl = 0.5 * segL;
      for (int j = 0; j < LS; j++) {
        float hl = max(length(p + S * tl) - RP, 0.0);
        lR += exp(-hl / HR) * segL; lM += exp(-hl / HM) * segL;
        tl += segL;
      }
      vec3 att = exp(-(BETA_R * (odR + lR) + vec3(BETA_M * 1.1) * (odM + lM)));
      sumR += att * dR; sumM += att * dM;
    }
    tc += seg;
  }
  vec3 radiance = SUN_I * (sumR * BETA_R * phR + sumM * BETA_M * phM);
  vec3 trans = exp(-(BETA_R * odR + vec3(BETA_M * 1.1) * odM));
  return vec4(1.0 - exp(-radiance * exposure), 1.0 - dot(trans, vec3(1.0 / 3.0)));
}
