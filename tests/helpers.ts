import type { Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------------------------------------
 * THE TEST-HOOK CONTRACT. The app exposes window.__EARTH__ ONLY when the URL has ?test=1.
 * It is read-mostly: tests observe real engine state (frames rendered, requests made, camera pose),
 * they never reach into engine internals and never stub the data. If the hook lies, the milestone report is void.
 * ---------------------------------------------------------------------------------------------- */
export type Pose = { lon: number; lat: number; alt: number; heading: number; pitch: number; roll: number; fovV: number };
export type Kind = 'observed' | 'projection' | 'illustrative';
export type LayerStatus = {
  id: string; active: boolean; opacity: number; time?: string;
  status: 'ok' | 'loading' | 'unavailable'; lastObservation?: string; source: string; kind: Kind;
};
export interface StageState {
  active: 'three' | 'cesium' | 'none';
  opacity: { three: number; cesium: number };
  three: { running: boolean; frames: number; disposed: boolean; programs: number; programNames: string[]; shaderErrors: number; drawCalls: number };
  cesium: { running: boolean; frames: number; tilesLoaded: boolean; ellipsoid: string; imagery: { id: string; time?: string; urlTemplate: string }[] };
}
export interface EarthTestApi {
  ready: Promise<void>;
  stage(): StageState;
  rig(): Pose;
  setPose(p: Partial<Pose>, o?: { instant?: boolean }): Promise<void>;
  layers(): LayerStatus[];
  setLayer(id: string, on: boolean): Promise<void>;
  setDate(iso: string | null): Promise<void>;
  setScenario(id: 'ssp119' | 'ssp245' | 'ssp585' | null): Promise<void>;
  story(): { chapter: string; progress: number; mode: 'story' | 'explore'; scrollTriggers: number; scrubbed: number };
  motion(): { reduced: boolean; autoRotateRate: number; maxTransitionMs: number };
  quality(): 'high' | 'balanced' | 'performance';
  shareUrl(): string;
}
declare global { interface Window { __EARTH__?: EarthTestApi } }

/** Thin typed wrappers so specs read like prose. */
export const E = {
  stage: (p: Page) => p.evaluate(() => window.__EARTH__!.stage()),
  rig: (p: Page) => p.evaluate(() => window.__EARTH__!.rig()),
  layers: (p: Page) => p.evaluate(() => window.__EARTH__!.layers()),
  story: (p: Page) => p.evaluate(() => window.__EARTH__!.story()),
  motion: (p: Page) => p.evaluate(() => window.__EARTH__!.motion()),
  shareUrl: (p: Page) => p.evaluate(() => window.__EARTH__!.shareUrl()),
  setPose: (p: Page, pose: Partial<Pose>, o?: { instant?: boolean }) => p.evaluate(([a, b]) => window.__EARTH__!.setPose(a as Partial<Pose>, b as { instant?: boolean } | undefined), [pose, o] as const),
  setLayer: (p: Page, id: string, on: boolean) => p.evaluate(([a, b]) => window.__EARTH__!.setLayer(a as string, b as boolean), [id, on] as const),
  setDate: (p: Page, iso: string | null) => p.evaluate((d) => window.__EARTH__!.setDate(d), iso),
  setScenario: (p: Page, id: 'ssp119' | 'ssp245' | 'ssp585' | null) => p.evaluate((s) => window.__EARTH__!.setScenario(s), id),
};

/* ---------- console / network gate: every test ends with expect(gate.errors()).toEqual([]) ---------- */
/** Each entry needs a justification comment and a tracking issue. An empty list is the goal. */
export const IGNORE: RegExp[] = [];
const GIBS = /(^|\/\/)gibs(-[abc])?\.earthdata\.nasa\.gov\//;

export function attachGates(page: Page) {
  const errors: string[] = [];
  const gibsMiss: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  page.on('response', (r) => {
    if (r.status() < 400) return;
    // GIBS answers 400/404 for tiles outside a layer's coverage; that is counted (see tileMissRate), not an error.
    if (GIBS.test(r.url()) && [400, 404].includes(r.status())) gibsMiss.push(r.url());
    else errors.push(`http ${r.status()}: ${r.url()}`);
  });
  return { errors: () => errors.filter((e) => !IGNORE.some((rx) => rx.test(e))), gibsMiss: () => gibsMiss };
}

/** Navigate with the test hook on and the cheapest quality tier, then wait for the first presented frame. */
export async function gotoEarth(page: Page, query = '') {
  const gate = attachGates(page);
  await page.goto(`/?test=1&q=performance${query ? `&${query}` : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__EARTH__, null, { timeout: 60_000 });
  await page.evaluate(() => window.__EARTH__!.ready);
  return gate;
}

/* ---------- GIBS network recorder ---------- */
export type GibsRow = { url: string; status: number; contentType: string };
export function recordGibs(page: Page): GibsRow[] {
  const rows: GibsRow[] = [];
  page.on('response', (r) => { if (GIBS.test(r.url())) rows.push({ url: r.url(), status: r.status(), contentType: r.headers()['content-type'] ?? '' }); });
  return rows;
}
export const gibsOk = (rows: GibsRow[]) => rows.filter((r) => r.status === 200 && /^image\//.test(r.contentType));
export const tileMissRate = (rows: GibsRow[]) => (rows.length ? rows.filter((r) => r.status === 400 || r.status === 404).length / rows.length : 0);

/* ---------- pixels: structure statistics + a 64-wide luminance thumbnail for "did this actually change?" ---------- */
export type Clip = { x: number; y: number; width: number; height: number };
export async function pixelStats(page: Page, clip?: Clip) {
  const buf = await page.screenshot(clip ? { clip } : {});
  return page.evaluate(async (b64: string) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
    const W = 64, H = Math.max(1, Math.round((64 * bmp.height) / bmp.width));
    const ctx = new OffscreenCanvas(W, H).getContext('2d')!;
    ctx.drawImage(bmp, 0, 0, W, H);
    const d = ctx.getImageData(0, 0, W, H).data;
    const lum: number[] = [];
    for (let i = 0; i < d.length; i += 4) lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const std = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
    return { mean, std, nonBlack: lum.filter((v) => v > 8).length / lum.length, thumb: lum.map((v) => Math.round(v)) };
  }, buf.toString('base64'));
}
/** Mean absolute luminance difference, 0..1. Identical frames = 0. */
export const thumbDiff = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - (b[i] ?? 0)), 0) / a.length / 255;

/* ---------- evidence ---------- */
/** Saves docs/evidence/<Mx>/<project>/<id>.png (milestone read from the @Mx tag in the test title) and attaches it to the report. */
export async function shot(page: Page, info: TestInfo, id: string) {
  const m = /@(M\d)/.exec(info.title)?.[1] ?? 'M0';
  const dir = path.join('docs', 'evidence', m, info.project.name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.png`);
  await page.screenshot({ path: file });
  await info.attach(id, { path: file, contentType: 'image/png' });
  return file;
}
export function saveJson(info: TestInfo, id: string, data: unknown) {
  const m = /@(M\d)/.exec(info.title)?.[1] ?? 'M0';
  const dir = path.join('docs', 'evidence', m, info.project.name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

/* ---------- input ---------- */
/** Real single-finger touch drag through CDP (Playwright has no multi-touch API; pinch is covered manually on devices). */
export async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (p: { x: number; y: number }) => [{ x: p.x, y: p.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Sample the active-stage state at a fixed cadence (used to prove "never two renderers at once"). */
export async function sampleStage(page: Page, durationMs: number, everyMs = 50) {
  const out: StageState[] = [];
  const t0 = Date.now();
  while (Date.now() - t0 < durationMs) { out.push(await E.stage(page)); await page.waitForTimeout(everyMs); }
  return out;
}
