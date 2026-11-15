/**
 * M0 harness self-test. These run against a self-contained stub page (no app, no network) and prove the
 * measuring instruments work BEFORE anything is measured with them. If these fail, no later result can be trusted.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { attachGates, pixelStats, thumbDiff, shot, touchDrag } from './helpers';

const STUB = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#000}</style>
<canvas id=c width=640 height=360 style="display:block;width:100vw;height:60vh;touch-action:none"></canvas>
<script>
  const c = document.getElementById('c'), g = c.getContext('2d');
  window.drawFlat = () => { g.fillStyle = '#000'; g.fillRect(0, 0, 640, 360); };
  window.drawStructured = (hue) => { for (let i = 0; i < 360; i += 6) { g.fillStyle = 'hsl(' + ((i + hue) % 360) + ',70%,' + (20 + (i % 60)) + '%)'; g.fillRect(0, i, 640, 6); } };
  window.touches = 0; c.addEventListener('touchmove', () => { window.touches++; }, { passive: true });
  drawFlat();
</script>`;

test('H-01 WebGL2 is available to the test browser (software is fine) @M0', async ({ page }) => {
  await page.setContent('<canvas id=c></canvas>');
  const r = await page.evaluate(() => {
    const gl = (document.getElementById('c') as HTMLCanvasElement).getContext('webgl2');
    if (!gl) return null;
    gl.clearColor(0, 1, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { green: px[1], max: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number };
  });
  expect(r, 'headless Chromium must provide WebGL2').not.toBeNull();
  expect(r!.green).toBe(255);
  expect(r!.max).toBeGreaterThanOrEqual(4096);
});

test('H-02 pixel statistics tell a flat frame from a structured one, and detect change @M0', async ({ page }) => {
  await page.setContent(STUB);
  const flat = await pixelStats(page);
  expect(flat.nonBlack).toBeLessThan(0.05);
  await page.evaluate(() => (window as unknown as { drawStructured: (h: number) => void }).drawStructured(0));
  const a = await pixelStats(page);
  expect(a.std).toBeGreaterThan(12);
  expect(thumbDiff(a.thumb, a.thumb)).toBe(0);
  await page.evaluate(() => (window as unknown as { drawStructured: (h: number) => void }).drawStructured(120));
  const b = await pixelStats(page);
  expect(thumbDiff(a.thumb, b.thumb)).toBeGreaterThan(0.004);
});

test('H-03 the console gate catches errors and treats GIBS tile misses as counted, not fatal @M0', async ({ page }) => {
  const gate = attachGates(page);
  await page.route('https://gibs.earthdata.nasa.gov/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.route('https://example.test/boom.png', (r) => r.fulfill({ status: 500, body: '' }));
  await page.setContent(`<img src="https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/X/default/500m/9/9/9.jpeg"><img src="https://example.test/boom.png">
    <script>console.error('deliberate'); setTimeout(() => { throw new Error('deliberate-uncaught'); }, 0);</script>`);
  await page.waitForTimeout(500);
  const errs = gate.errors().join('\n');
  expect(errs).toContain('console.error: deliberate');
  expect(errs).toContain('deliberate-uncaught');
  expect(errs).toContain('http 500');
  expect(gate.gibsMiss().length, 'the GIBS 404 is recorded separately').toBe(1);
  expect(errs, 'a GIBS 404 must not appear as an error').not.toContain('gibs.earthdata');
});

test('H-04 touch drag produces real touch events @M0', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'mobile', 'touch emulation is a mobile-project feature; desktop covers mouse drag in AC-14');
  void browser;
  await page.setContent(STUB);
  await touchDrag(page, { x: 250, y: 120 }, { x: 80, y: 120 });
  expect(await page.evaluate(() => (window as unknown as { touches: number }).touches)).toBeGreaterThan(5);
});

test('H-05 evidence screenshots land in docs/evidence/<milestone>/<project>/ @M0', async ({ page }, info) => {
  await page.setContent(STUB);
  const file = await shot(page, info, 'H-05-evidence-probe');
  expect(fs.existsSync(file)).toBe(true);
  expect(fs.statSync(file).size).toBeGreaterThan(500);
  expect(file).toContain(`docs/evidence/M0/${info.project.name}/`);
});
