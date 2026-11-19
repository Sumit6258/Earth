import { test, expect } from '@playwright/test';
import { WGS84_A, geodeticToEcef, ecefToThree, geodeticNormal } from '../../src/geo/ecef';
import { subsolarPoint, sunDirectionEcef } from '../../src/geo/sky';
import { cloudAlpha } from '../../scripts/textures/build-clouds.mjs';
import { gibsTileBounds, gibsUrl } from '../../src/geo/gibs';

test('U-01 ECEF: equator, pole, and the Three.js axis rotation @M1', () => {
  const [x, y, z] = geodeticToEcef(0, 0, 0);
  expect(x).toBeCloseTo(WGS84_A, 3); expect(Math.abs(y)).toBeLessThan(1e-6); expect(Math.abs(z)).toBeLessThan(1e-6);
  const pole = geodeticToEcef(0, 90, 0);
  expect(pole[2]).toBeCloseTo(6356752.314245, 2); // WGS84 semi-minor axis
  expect(ecefToThree([1, 2, 3])).toEqual([1, 3, -2]);
  const n = geodeticNormal(40, 55);
  expect(Math.hypot(...n)).toBeCloseTo(1, 12);
});

test('U-02 the Sun: equinox, both solstices, and noon longitude are where astronomy says @M1', () => {
  expect(Math.abs(subsolarPoint(new Date('2026-03-20T14:46:00Z')).lat)).toBeLessThan(0.1);
  expect(subsolarPoint(new Date('2026-06-21T08:24:00Z')).lat).toBeCloseTo(23.43, 1);
  expect(subsolarPoint(new Date('2026-12-21T20:50:00Z')).lat).toBeCloseTo(-23.43, 1);
  // at 12:00 UTC the Sun is over Greenwich give or take the equation of time (at most about 4.1 degrees)
  for (const d of ['2026-02-11', '2026-05-14', '2026-07-26', '2026-11-03']) {
    expect(Math.abs(subsolarPoint(new Date(`${d}T12:00:00Z`)).lon)).toBeLessThan(5);
    expect(Math.abs(Math.abs(subsolarPoint(new Date(`${d}T00:00:00Z`)).lon) - 180)).toBeLessThan(5);
  }
  expect(Math.hypot(...sunDirectionEcef(new Date()))).toBeCloseTo(1, 12);
});

test('U-03 the cloud mask keeps white cloud, drops cyan snow, ocean and land @M1', () => {
  expect(cloudAlpha(250, 250, 250)).toBeGreaterThan(240);      // thick cloud (white in bands 7-2-1)
  expect(cloudAlpha(20, 245, 245)).toBeLessThan(5);            // snow and ice (cyan: low red)
  expect(cloudAlpha(10, 30, 60)).toBe(0);                      // ocean
  expect(cloudAlpha(120, 140, 70)).toBeLessThan(60);           // vegetation
  expect(cloudAlpha(0, 0, 0)).toBe(0);                         // swath gap
  expect(cloudAlpha(150, 155, 160)).toBeGreaterThan(cloudAlpha(120, 125, 130)); // monotonic: thin cloud is fainter
});

test('U-04 GIBS EPSG:4326 tile grid: level 0 is 288 degrees, level 3 tiles the world in 10 x 5 @M1', () => {
  expect(gibsTileBounds(0, 0, 0)).toEqual({ west: -180, east: 108, north: 90, south: -198 });
  const first = gibsTileBounds(3, 0, 0), last = gibsTileBounds(3, 9, 4);
  expect([first.west, first.north, last.east, last.south]).toEqual([-180, 90, 180, -90]); // exactly the world
  expect(gibsUrl('X', 'jpeg')).toBe('https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/X/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpeg');
  expect(gibsUrl('X', 'jpg', '2023-07-01')).toContain('/default/2023-07-01/{TileMatrixSet}');
});
