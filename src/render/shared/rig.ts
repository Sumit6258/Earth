import { WGS84_A } from '../../geo/ecef';

/** The single camera description shared by every renderer and by the scroll story. Degrees; alt in metres above the ellipsoid. */
export interface CameraRig { lon: number; lat: number; alt: number; heading: number; pitch: number; roll: number; fovV: number }

const RAD = Math.PI / 180;
export const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const unit = (p: { lon: number; lat: number }): [number, number, number] => [Math.cos(p.lat * RAD) * Math.cos(p.lon * RAD), Math.cos(p.lat * RAD) * Math.sin(p.lon * RAD), Math.sin(p.lat * RAD)];

/** Great-circle interpolation between two lon/lat points (degrees). The camera flies the short way over the globe. */
export function slerpLonLat(a: { lon: number; lat: number }, b: { lon: number; lat: number }, t: number) {
  const va = unit(a), vb = unit(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  if (om < 1e-9) return { lon: a.lon, lat: a.lat };
  if (Math.PI - om < 1e-6) return { lon: wrap180(a.lon + wrap180(b.lon - a.lon) * t), lat: a.lat + (b.lat - a.lat) * t }; // antipodal: any path is as good as another
  const s = Math.sin(om), k0 = Math.sin((1 - t) * om) / s, k1 = Math.sin(t * om) / s;
  const v: [number, number, number] = [va[0] * k0 + vb[0] * k1, va[1] * k0 + vb[1] * k1, va[2] * k0 + vb[2] * k1];
  return { lon: Math.atan2(v[1], v[0]) / RAD, lat: Math.asin(Math.max(-1, Math.min(1, v[2] / Math.hypot(...v)))) / RAD };
}

/** Altitude interpolates in log space: flying from 15,000 km to 700 km feels even, not abrupt at the end. */
export const lerpLogAlt = (a: number, b: number, t: number) => Math.exp(Math.log(Math.max(1, a)) * (1 - t) + Math.log(Math.max(1, b)) * t);

export function interpolateRig(a: CameraRig, b: CameraRig, t: number): CameraRig {
  const p = slerpLonLat(a, b, t), lin = (x: number, y: number) => x + (y - x) * t;
  return { lon: p.lon, lat: p.lat, alt: lerpLogAlt(a.alt, b.alt, t), heading: wrap180(a.heading + wrap180(b.heading - a.heading) * t), pitch: lin(a.pitch, b.pitch), roll: lin(a.roll, b.roll), fovV: lin(a.fovV, b.fovV) };
}

/** The Three.js stage orbits the Earth's centre: yaw = lon + 90 degrees, pitch = lat, distance in Earth radii. */
export const rigToOrbit = (r: Pick<CameraRig, 'lon' | 'lat' | 'alt'>) => ({ yaw: (r.lon + 90) * RAD, pitch: r.lat * RAD, dist: 1 + r.alt / WGS84_A });
export const orbitToRig = (o: { yaw: number; pitch: number; dist: number }, fovV = 38): CameraRig => ({ lon: wrap180(o.yaw / RAD - 90), lat: o.pitch / RAD, alt: (o.dist - 1) * WGS84_A, heading: 0, pitch: -90, roll: 0, fovV });
