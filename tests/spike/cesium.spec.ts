import { test, expect } from '@playwright/test';
import { attachGates, recordGibs, gibsOk, pixelStats, shot, saveJson } from '../helpers';

type Rect = { level: number; x: number; y: number; west: number; south: number; east: number; north: number };
type Hook = { ready: Promise<void>; stage(): { cesium: { tilesLoaded: boolean; ellipsoid: string; frames: number; imagery: { id: string; time?: string }[] } }; setDate(iso: string): Promise<void>; tileRects(l: number[][]): Rect[] };

async function open(page: import('@playwright/test').Page, query = '') {
  const gate = attachGates(page);
  await page.goto(`/cesium.html?test=1${query ? `&${query}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __EARTH__?: unknown }).__EARTH__, null, { timeout: 90_000 });
  await page.evaluate(() => (window as unknown as { __EARTH__: Hook }).__EARTH__.ready);
  return gate;
}

test('S-01 Cesium draws real NASA GIBS imagery on a WGS84 globe, loaded lazily @M2', async ({ page }, info) => {
  const gibs = recordGibs(page);
  const gate = await open(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __EARTH__: Hook }).__EARTH__.stage().cesium.tilesLoaded), { timeout: 150_000, intervals: [2000] }).toBe(true);
  const s = await page.evaluate(() => (window as unknown as { __EARTH__: Hook }).__EARTH__.stage());
  expect(s.cesium.ellipsoid).toMatch(/6378137/);
  expect(s.cesium.imagery.some((i) => i.id === 'BlueMarble_ShadedRelief_Bathymetry')).toBe(true);
  const ok = gibsOk(gibs);
  expect(ok.length, 'real tiles from gibs.earthdata.nasa.gov').toBeGreaterThan(4);
  expect((await pixelStats(page)).std).toBeGreaterThan(15);
  saveJson(info, 'S-01-gibs-requests', { total: gibs.length, ok: ok.length, sample: ok.slice(0, 8) });
  await shot(page, info, 'S-01-cesium-gibs');
  expect(gate.errors()).toEqual([]);
});

test('S-02 Cesium tiling scheme reproduces GIBS EPSG:4326 tile bounds for levels 0 to 8 @M2', async ({ page }) => {
  await open(page);
  const list = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 2, 1], [2, 4, 2], [3, 9, 4], [4, 17, 9], [5, 5, 5], [6, 40, 20], [7, 100, 60], [8, 300, 120]];
  const rects = await page.evaluate((l) => (window as unknown as { __EARTH__: Hook }).__EARTH__.tileRects(l), list);
  for (const r of rects) {
    const span = 288 / 2 ** r.level;
    const exp = { west: -180 + r.x * span, east: -180 + (r.x + 1) * span, north: 90 - r.y * span, south: 90 - (r.y + 1) * span };
    for (const k of ['west', 'east', 'north', 'south'] as const) expect(Math.abs(r[k] - exp[k]), `level ${r.level} tile ${r.x},${r.y} ${k}`).toBeLessThan(1e-7);
  }
});

test('S-03 the date control requests exactly that day of MODIS imagery @M2', async ({ page }, info) => {
  const gibs = recordGibs(page);
  const gate = await open(page);
  await page.evaluate(() => (window as unknown as { __EARTH__: Hook }).__EARTH__.setDate('2023-07-01'));
  await expect.poll(() => gibs.some((r) => r.url.includes('/2023-07-01/') && r.status === 200 && /^image\//.test(r.contentType)), { timeout: 120_000 }).toBe(true);
  const s = await page.evaluate(() => (window as unknown as { __EARTH__: Hook }).__EARTH__.stage());
  expect(s.cesium.imagery.find((i) => i.id === 'MODIS_Terra_CorrectedReflectance_TrueColor')?.time).toBe('2023-07-01');
  await page.waitForTimeout(3000);
  await shot(page, info, 'S-03-modis-2023-07-01');
  expect(gate.errors()).toEqual([]);
});
