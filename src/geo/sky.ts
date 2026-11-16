import type { Vec3 } from './ecef';

const RAD = Math.PI / 180;
const wrap = (d: number, m: number) => ((d % m) + m) % m;

/** Unit vector toward the Sun in ECEF. Astronomical Almanac low-precision formulas (about 0.01 degrees). */
export function sunDirectionEcef(date: Date): Vec3 {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000.0
  const L = wrap(280.46 + 0.9856474 * n, 360);
  const g = wrap(357.528 + 0.9856003 * n, 360) * RAD;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 4e-7 * n) * RAD;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = wrap(280.46061837 + 360.98564736629 * n, 360) * RAD;
  const lon = ra - gmst; // subsolar longitude
  return [Math.cos(dec) * Math.cos(lon), Math.cos(dec) * Math.sin(lon), Math.sin(dec)];
}

export function subsolarPoint(date: Date) {
  const [x, y, z] = sunDirectionEcef(date);
  return { lat: Math.asin(z) / RAD, lon: Math.atan2(y, x) / RAD };
}
