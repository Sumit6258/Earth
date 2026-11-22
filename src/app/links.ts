import { toQuery } from './deeplink';

/** Altitude range the Three.js globe can show (camera distance 1.35..8 Earth radii). */
export const clampThreeAlt = (alt: number) => Math.min(44_000_000, Math.max(2_300_000, alt));

/** From the 3D opening into the zoomable Cesium page, carrying the exact camera position. */
export const cesiumHref = (r: { lat: number; lon: number; alt: number }) =>
  `cesium.html?${toQuery({ view: 'cesium', lat: r.lat, lon: r.lon, alt: Math.min(40_000_000, Math.max(100, r.alt)) })}`;

/** And back out to the globe. */
export const globeHref = (r: { lat: number; lon: number; alt: number }) =>
  `./?${toQuery({ view: 'three', lat: r.lat, lon: r.lon, alt: clampThreeAlt(r.alt) })}`;
