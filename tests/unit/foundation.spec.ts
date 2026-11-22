import { test, expect } from '@playwright/test';
import { slerpLonLat, lerpLogAlt, interpolateRig, rigToOrbit, orbitToRig, type CameraRig } from '../../src/render/shared/rig';
import { Orchestrator, DEFAULT_ORCHESTRATOR } from '../../src/app/orchestrator';
import { fromQuery, toQuery } from '../../src/app/deeplink';
import { cesiumHref, globeHref, clampThreeAlt } from '../../src/app/links';

const rig = (o: Partial<CameraRig> = {}): CameraRig => ({ lon: 0, lat: 0, alt: 1e7, heading: 0, pitch: -90, roll: 0, fovV: 38, ...o });

test('U-05 rig: great-circle path, log altitude, shortest heading, orbit round trip @M2', () => {
  const m = slerpLonLat({ lon: 0, lat: 0 }, { lon: 90, lat: 0 }, 0.5);
  expect(m.lon).toBeCloseTo(45, 9); expect(m.lat).toBeCloseTo(0, 9);
  expect(slerpLonLat({ lon: 10, lat: 0 }, { lon: 10, lat: 80 }, 0.5).lat).toBeCloseTo(40, 9);
  expect(Math.abs(Math.abs(slerpLonLat({ lon: 170, lat: 0 }, { lon: -170, lat: 0 }, 0.5).lon) - 180)).toBeLessThan(1e-9); // crosses the antimeridian the short way
  expect(slerpLonLat({ lon: 0, lat: 60 }, { lon: 90, lat: 60 }, 0.5).lat).toBeGreaterThan(65);                           // great circles bulge toward the pole
  const a = { lon: 33, lat: -12 }, b = { lon: -120, lat: 48 };
  expect(slerpLonLat(a, b, 0)).toEqual(a);
  expect(slerpLonLat(a, b, 1).lon).toBeCloseTo(b.lon, 9);
  expect(lerpLogAlt(1e6, 1e8, 0.5)).toBeCloseTo(1e7, 0);
  expect(interpolateRig(rig({ heading: 350 }), rig({ heading: 10 }), 0.5).heading).toBeCloseTo(0, 9);
  for (const r of [rig({ lon: 20, lat: 15, alt: 1e7 }), rig({ lon: -170, lat: -60, alt: 7e5 }), rig({ lon: 179.5, lat: 89, alt: 3e6 })]) {
    const back = orbitToRig(rigToOrbit(r));
    expect(back.lon).toBeCloseTo(r.lon, 9); expect(back.lat).toBeCloseTo(r.lat, 9); expect(back.alt).toBeCloseTo(r.alt, 3);
  }
});

function drive(alts: (t: number) => number, ms: number, step = 16) {
  const o = new Orchestrator(), frames = [];
  for (let t = 0; t <= ms; t += step) frames.push({ t, f: o.update(alts(t), t) });
  return frames;
}

test('U-06 orchestrator: one renderer at a time, a short crossfade, no flicker near the boundary @M2', () => {
  const { preheatMs, crossfadeMs, hIn, hOut } = DEFAULT_ORCHESTRATOR;
  const hold = drive(() => 1.5e7, 3000);                                                    // far away: Three only, Cesium never draws
  expect(hold.every(({ f }) => f.phase === 'three' && !f.cesiumRendering && f.threeRendering)).toBe(true);

  const down = drive((t) => (t < 1000 ? 1.5e7 : 7e5), 5000);                               // descend into Amazonia
  expect(down.every(({ f }) => f.threeRendering || f.cesiumRendering)).toBe(true);             // never nothing drawing
  expect(down.every(({ f }) => Math.abs(f.threeOpacity + f.cesiumOpacity - 1) < 1e-9)).toBe(true); // no black flash
  const last = down.at(-1)!.f;
  expect([last.phase, last.threeRendering, last.cesiumRendering]).toEqual(['cesium', false, true]); // Three is paused afterwards
  const both = down.filter(({ f }) => f.threeRendering && f.cesiumRendering).length * 16;
  expect(both).toBeLessThanOrEqual(preheatMs + crossfadeMs + 64);                              // overlap is bounded
  const mixes = down.map(({ f }) => f.mix);
  expect(mixes.every((m, i) => i === 0 || m >= mixes[i - 1] - 1e-12)).toBe(true);                // monotone on the way in

  const wobble = drive((t) => (hIn + hOut) / 2 + 400_000 * Math.sin(t / 150), 4000);           // hover between the thresholds: stays Three
  expect(wobble.every(({ f }) => f.phase === 'three')).toBe(true);

  const back = drive((t) => (t < 1000 ? 7e5 : 1.2e7), 6000);                                  // and back out to space
  expect(back.at(-1)!.f.phase).toBe('three'); expect(back.at(-1)!.f.cesiumRendering).toBe(false);
  const reversal = drive((t) => (t < 1000 ? 7e5 : t < 1400 ? 3e6 : 1.2e7), 6000);              // change of mind in the middle of the crossfade
  const dm = reversal.map(({ f }) => f.mix).map((m, i, a) => (i ? Math.abs(m - a[i - 1]) : 0));
  expect(Math.max(...dm)).toBeLessThanOrEqual(16 / crossfadeMs + 1e-9);                         // continuous, never jumps
});

test('U-07 share links: strict validation, stable round trip, nothing trusted @M2', () => {
  const s = { chapter: 'vanishing-green', view: 'cesium' as const, lat: -3.4653, lon: -62.2159, alt: 1_800_000, layers: ['forest-loss', 'sst'], date: '2024-08-01', scenario: 'ssp245' as const };
  expect(fromQuery(toQuery(s))).toEqual({ state: s, errors: [] });
  expect(toQuery(s)).toBe(toQuery(fromQuery(toQuery(s)).state));                                  // canonical
  const bad = fromQuery('lat=91&lon=abc&alt=5&d=2024-02-30&s=ssp999&view=<script>&l=ok,BAD&c=../x&extra=1');
  expect(bad.state).toEqual({});
  expect(bad.errors.sort()).toEqual(['alt', 'c', 'd', 'l', 'lat', 'lon', 's', 'view']);
  expect(fromQuery('d=1850-01-01').errors).toEqual(['d']);                                         // before the instrumental record
  expect(fromQuery('d=2100-12-31').state.date).toBe('2100-12-31');
  expect(fromQuery('').state).toEqual({});
});

test('U-08 view links carry the camera across pages and survive validation @M2', () => {
  const view = { lat: 12.3456789, lon: 20.1234567, alt: 16_606_000.4 };
  const q = cesiumHref(view);
  expect(q.startsWith('cesium.html?')).toBe(true);
  const s = fromQuery(q.split('?')[1]);
  expect(s.errors).toEqual([]);
  expect(s.state).toMatchObject({ view: 'cesium', lat: 12.3457, lon: 20.1235, alt: 16_606_000 });
  const back = fromQuery(globeHref({ lat: 5, lon: 5, alt: 900 }).split('?')[1]).state;       // Cesium can be far lower than the globe allows
  expect(back.alt).toBe(clampThreeAlt(900));
  expect(clampThreeAlt(1e9)).toBe(44_000_000);
  expect(fromQuery(cesiumHref({ lat: 0, lon: 0, alt: 3e9 }).split('?')[1]).errors).toEqual([]); // out-of-range altitudes are clamped, not rejected
});
