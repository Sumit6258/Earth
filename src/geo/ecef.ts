export const WGS84_A = 6378137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_E2 = WGS84_F * (2 - WGS84_F);
const RAD = Math.PI / 180;

export type Vec3 = [number, number, number];

/** Geodetic (degrees, metres above the ellipsoid) to Earth-fixed ECEF metres. */
export function geodeticToEcef(lonDeg: number, latDeg: number, h = 0): Vec3 {
  const l = lonDeg * RAD, p = latDeg * RAD, s = Math.sin(p), c = Math.cos(p);
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);
  return [(n + h) * c * Math.cos(l), (n + h) * c * Math.sin(l), (n * (1 - WGS84_E2) + h) * s];
}

/** ECEF (x to lon 0, y to lon 90E, z north) to Three.js axes (y up): a pure rotation, (x, y, z) -> (x, z, -y). */
export const ecefToThree = ([x, y, z]: Vec3): Vec3 => [x, z, -y];

/** Unit geodetic surface normal in ECEF. */
export function geodeticNormal(lonDeg: number, latDeg: number): Vec3 {
  const l = lonDeg * RAD, p = latDeg * RAD;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}
