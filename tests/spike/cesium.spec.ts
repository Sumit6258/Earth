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

test('S-04 Explore flies the camera in and the Cesium link carries that exact view @M2', async ({ page }) => {
  const gate = attachGates(page);
  await page.goto('/?test=1&q=performance', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window as unknown as { __EARTH__?: unknown }).__EARTH__, null, { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as { __EARTH__: { ready: Promise<void> } }).__EARTH__.ready);
  const before = await page.evaluate(() => (window as unknown as { __EARTH__: { rig(): { alt: number } } }).__EARTH__.rig().alt);
  await page.getByTestId('explore').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __EARTH__: { rig(): { alt: number } } }).__EARTH__.rig().alt), { timeout: 30_000 }).toBeLessThan(3_600_000);
  expect(before).toBeGreaterThan(10_000_000);
  await expect.poll(async () => Number(new URL((await page.getByTestId('zoom').getAttribute('href'))!, 'http://x/').searchParams.get('alt')), { timeout: 10_000 }).toBeLessThan(3_700_000);
  const u = new URL((await page.getByTestId('zoom').getAttribute('href'))!, 'http://x/');
  expect(u.pathname.endsWith('cesium.html')).toBe(true);
  expect(u.searchParams.get('view')).toBe('cesium');
  expect(Number.isFinite(Number(u.searchParams.get('lat')))).toBe(true);
  expect(gate.errors()).toEqual([]);
});

test('L-01 the CO2 panel shows real NOAA values with units, source and honest limits @M3', async ({ page }, info) => {
  const gate = attachGates(page);
  await page.goto('/?test=1&q=performance', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('co2-panel')).toBeVisible();
  await expect(page.getByTestId('legend-units')).toBeVisible(); // fails, with the reason on screen, if the dataset did not build
  const json = await (await page.request.get('/data/co2-mlo.json')).json() as { annual: { year: number; ppm: number }[] };
  const row = json.annual.find((r) => r.year === 2000)!;
  await page.getByTestId('co2-year').fill('2000');
  await expect(page.getByTestId('observation-date')).toHaveText('2000');
  await expect(page.locator('#co2-val')).toContainText(row.ppm.toFixed(2));
  expect(await page.getByTestId('kind-badge').getAttribute('data-kind')).toBe('observed');
  expect(await page.getByTestId('source-link').getAttribute('href')).toMatch(/^https:\/\/gml\.noaa\.gov/);
  await page.getByTestId('co2-year').fill('1900');
  await expect(page.getByTestId('coverage-note')).toContainText(/before 1959/);
  await expect(page.getByTestId('kind-badge')).toBeHidden();      // no measurement, so no "observed" label
  await shot(page, info, 'L-01-co2-1900-no-measurement');
  expect(gate.errors()).toEqual([]);
});
