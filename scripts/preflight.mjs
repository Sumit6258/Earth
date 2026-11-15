#!/usr/bin/env node
/**
 * EARTH · Gate 0 — environment preflight. It verifies; it never assumes.
 *
 *   node scripts/preflight.mjs                      run every check, write docs/evidence/M0/preflight.json
 *   node scripts/preflight.mjs --check-persistence  run in a NEW session to prove the repo/filesystem persisted
 *   node scripts/preflight.mjs --skip id1,id2       mark checks that cannot apply here (e.g. repo.remote_write in CI) as SKIP
 *   node scripts/preflight.mjs --out some/file.json
 *
 * Exit code 0  = every REQUIRED check passed.
 * Exit code 1  = at least one REQUIRED check failed: STOP, write docs/reports/M0-blocked.md, do not scaffold.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { curlProbe, curlText } from './lib/http.mjs';

const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const OUT = argVal('--out') ?? 'docs/evidence/M0/preflight.json';
const MARKER = 'docs/evidence/M0/persistence-marker.json';
const ORIGIN = 'https://earth.sumitsuman.com';
const GL_ARGS = ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-dev-shm-usage'];

const SKIP = new Set((argVal('--skip') ?? '').split(',').filter(Boolean));
const results = [];
const add = (id, level, status, detail, data) => results.push({ id, level, status: SKIP.has(id) ? 'SKIP' : status, detail: SKIP.has(id) ? `skipped by --skip (was ${status}: ${detail})` : detail, ...(data ? { data } : {}) });
const run = (cmd, a, o = {}) => spawnSync(cmd, a, { encoding: 'utf8', timeout: 30000, ...o });

/* ---------- persistence mode ---------- */
if (args.includes('--check-persistence')) {
  if (!fs.existsSync(MARKER)) { console.log(`✘ no marker at ${MARKER}. It must be committed + pushed in session 1, then this run in session 2.`); process.exit(1); }
  const m = JSON.parse(fs.readFileSync(MARKER, 'utf8'));
  const sameHost = m.hostname === os.hostname();
  console.log(`marker written ${m.createdAt} on host "${m.hostname}"; this host is "${os.hostname()}"`);
  console.log(sameHost ? '! same host: this only proves the VM survived, not that a fresh clone has the file' : '✔ different host and the marker is present: the repo persists across sessions');
  process.exit(0);
}

/* ---------- 1. runtime ---------- */
const [maj, min] = process.versions.node.split('.').map(Number);
const nodeOk = (maj === 22 && min >= 12) || maj > 22 || (maj === 20 && min >= 19);
add('runtime.node', 'REQUIRED', nodeOk ? 'PASS' : 'FAIL', `node ${process.versions.node} (Vite 8 needs >= 20.19 or >= 22.12)`);
const npmV = run('npm', ['-v']);
add('runtime.npm', 'REQUIRED', npmV.status === 0 ? 'PASS' : 'FAIL', npmV.status === 0 ? `npm ${npmV.stdout.trim()}` : 'npm not runnable');
const free = (() => { try { const s = fs.statfsSync('.'); return Math.round((s.bavail * s.bsize) / 1e9); } catch { return null; } })();
add('runtime.machine', 'INFO', 'INFO', `${os.platform()}/${os.arch()} · ${os.cpus().length} cpu · ${Math.round(os.totalmem() / 1e9)} GB RAM · ${free ?? '?'} GB free disk · gpu nodes: ${fs.existsSync('/dev/dri') ? fs.readdirSync('/dev/dri').join(',') : 'none (software GL only)'}`);
add('runtime.proxy', 'INFO', 'INFO', ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'NODE_USE_ENV_PROXY'].filter((k) => process.env[k]).join(', ') || 'no proxy env set (scripts use curl either way; node fetch ignores proxies by default)');

/* ---------- 2. repository + terminal ---------- */
const git = (a) => run('git', a, { timeout: 20000 });
const inRepo = git(['rev-parse', '--is-inside-work-tree']).stdout?.trim() === 'true';
add('repo.worktree', 'REQUIRED', inRepo ? 'PASS' : 'FAIL', inRepo ? 'inside a git work tree' : 'not inside a git repository');
if (inRepo) {
  const o = git(['remote', 'get-url', 'origin']);
  add('repo.origin', 'REQUIRED', o.status === 0 ? 'PASS' : 'FAIL', o.status === 0 ? o.stdout.trim().replace(/\/\/[^@/]*@/, '//***@') : 'no remote named origin');
  if (o.status === 0) {
    const l = git(['ls-remote', '--heads', 'origin']);
    add('repo.remote_read', 'REQUIRED', l.status === 0 ? 'PASS' : 'FAIL', l.status === 0 ? 'origin reachable (read)' : `cannot read origin: ${(l.stderr || '').trim().slice(0, 120)}`);
    const p = git(['push', '--dry-run', 'origin', 'HEAD']);
    add('repo.remote_write', 'REQUIRED', p.status === 0 ? 'PASS' : 'FAIL', p.status === 0 ? 'push dry-run accepted' : `push dry-run failed: ${(p.stderr || '').trim().split('\n').pop()?.slice(0, 120)}`);
  }
  const who = git(['config', 'user.email']).stdout.trim();
  add('repo.identity', 'RECOMMENDED', who ? 'PASS' : 'WARN', who ? 'git identity configured' : 'git user.email unset; commits will fail');
}
add('env.platform', 'INFO', 'INFO', ['CLAUDE_CODE_REMOTE', 'CODESPACES', 'GITPOD_WORKSPACE_ID', 'CI'].filter((k) => process.env[k]).map((k) => `${k}=${process.env[k]}`).join(' ') || 'no known cloud-IDE env flags');
try {
  fs.mkdirSync(path.dirname(MARKER), { recursive: true });
  fs.writeFileSync(MARKER, JSON.stringify({ createdAt: new Date().toISOString(), hostname: os.hostname() }, null, 2));
  add('repo.persistence', 'RECOMMENDED', 'WARN', `marker written to ${MARKER}. Commit + push it, then run "node scripts/preflight.mjs --check-persistence" in a new session`);
} catch (e) { add('repo.persistence', 'REQUIRED', 'FAIL', `cannot write to the working tree: ${e.message}`); }

/* ---------- 3. package installation + exact version pins ---------- */
const PKGS = ['three', '@types/three', 'cesium', 'gsap', 'vite', 'typescript', '@playwright/test', '@axe-core/playwright', 'vite-plugin-static-copy', 'sharp'];
const versions = {};
for (const p of PKGS) {
  const r = curlText(`https://registry.npmjs.org/${p.replace('/', '%2f')}/latest`, { timeout: 12 });
  try { versions[p] = r.status === 200 ? JSON.parse(r.text).version : null; } catch { versions[p] = null; }
}
const resolved = Object.values(versions).filter(Boolean).length;
add('npm.registry', 'REQUIRED', resolved === PKGS.length ? 'PASS' : 'FAIL', resolved === PKGS.length ? 'registry.npmjs.org reachable; latest versions recorded in data.versions (pin these exactly)' : `registry reachable for ${resolved}/${PKGS.length} packages`, versions);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'earth-npm-'));
fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"probe","version":"0.0.0","private":true}');
const inst = run('npm', ['install', '--dry-run', '--no-audit', '--no-fund', '--ignore-scripts', '--fetch-retries=0', '--fetch-timeout=10000', 'three'], { cwd: tmp, timeout: 60000 });
add('npm.install', 'REQUIRED', inst.status === 0 ? 'PASS' : 'FAIL', inst.status === 0 ? 'npm install resolves through the npm client (proxy config honoured)' : `npm install failed: ${(inst.stderr || '').trim().split('\n').find((l) => /error/i.test(l))?.slice(0, 140) ?? 'unknown'}`);

/* ---------- 4. imagery + data APIs ---------- */
const G = 'https://gibs.earthdata.nasa.gov/wmts';
const probes = [
  ['gibs.tile.static', 'REQUIRED', `${G}/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/500m/3/2/3.jpeg`, /^image\//, true],
  ['gibs.tile.dated', 'REQUIRED', `${G}/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2012-07-09/250m/6/13/36.jpg`, /^image\//, true],
  ['gibs.tile.3857', 'REQUIRED', `${G}/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/3/2/3.jpeg`, /^image\//, true],
  ['gibs.capabilities', 'REQUIRED', `${G}/epsg4326/best/1.0.0/WMTSCapabilities.xml`, /xml/, false],
  ['giss.gistemp', 'RECOMMENDED', 'https://data.giss.nasa.gov/gistemp/', /html/, false],
  ['noaa.co2', 'RECOMMENDED', 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv', /text|csv/, false],
  ['nsidc.seaice', 'RECOMMENDED', 'https://noaadata.apps.nsidc.org/NOAA/G02135/', /html/, false],
  ['firms.keyless', 'RECOMMENDED', 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Northern_and_Central_Africa_24h.csv', /text|csv/, false],
  ['gfw.tiles', 'RECOMMENDED', 'https://tiles.globalforestwatch.org/umd_tree_cover_loss/latest/dynamic/2/1/1.png', /^image\//, true],
  ['copernicus.cds', 'RECOMMENDED', 'https://cds.climate.copernicus.eu/', /html/, false],
  ['cesium.ion', 'RECOMMENDED', 'https://api.cesium.com/', /./, false],
];
for (const [id, level, url, ct, cors] of probes) {
  const r = curlProbe(url, { headers: cors ? { Origin: ORIGIN } : {} });
  const okStatus = r.status >= 200 && r.status < 300;
  const okType = ct.test(r.contentType ?? '');
  const corsOk = !cors || !!r.acao;
  const pass = okStatus && okType && corsOk;
  add(id, level, pass ? 'PASS' : level === 'REQUIRED' ? 'FAIL' : 'WARN',
    `HTTP ${r.status || 'none'} ${r.contentType || ''}${cors ? ` · CORS ${r.acao ?? 'MISSING'}` : ''}${r.deny ? ` · proxy denied: ${r.deny}` : ''}${r.error ? ` · ${r.error}` : ''} · ${url}`);
}

/* ---------- 5. browser automation (Playwright + WebGL2) ---------- */
async function checkBrowser() {
  let pw = null;
  for (const name of ['@playwright/test', 'playwright']) { try { pw = await import(name); break; } catch { /* try next */ } }
  if (!pw) return add('browser.playwright', 'REQUIRED', 'FAIL', 'Playwright not installed here. Run: npm i -D @playwright/test && npx playwright install --with-deps chromium');
  add('browser.playwright', 'REQUIRED', 'PASS', 'Playwright module resolves');
  const dry = run('npx', ['--no-install', 'playwright', 'install', '--dry-run', 'chromium'], { timeout: 45000 });
  const urls = [...new Set(((dry.stdout ?? '') + (dry.stderr ?? '')).match(/https?:\/\/[^\s'"]+/g) ?? [])];
  const reach = urls.map((u) => ({ host: new URL(u).host, status: curlProbe(u, { timeout: 15 }).status }));
  add('browser.download_hosts', 'RECOMMENDED', reach.length && reach.every((r) => r.status >= 200 && r.status < 400) ? 'PASS' : 'WARN', reach.length ? [...new Set(reach.map((r) => `${r.host}=${r.status}`))].join(' ') : 'could not list browser download URLs; allow cdn.playwright.dev + playwright.download.prss.microsoft.com', reach);
  const chromium = pw.chromium ?? pw.default?.chromium;
  let browser;
  try {
    browser = await chromium.launch({ args: GL_ARGS });
    const page = await browser.newPage();
    const g = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return { webgl2: false };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return { webgl2: true, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a', maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE), red: px[0] };
    });
    add('browser.webgl2', 'REQUIRED', g.webgl2 && g.red === 255 ? 'PASS' : 'FAIL', g.webgl2 ? `WebGL2 ok · chromium: ${chromium.executablePath()} · renderer: ${g.renderer} · max texture ${g.maxTexture}${/swiftshader|llvmpipe|software/i.test(g.renderer) ? ' · SOFTWARE rendering: frame-rate numbers from this machine are not representative' : ''}` : 'WebGL2 unavailable in headless Chromium', g);
  } catch (e) {
    add('browser.webgl2', 'REQUIRED', 'FAIL', `${String(e.message).split('\n')[0]} (install browsers: npx playwright install --with-deps chromium)`);
  } finally { await browser?.close().catch(() => {}); }
}
await checkBrowser();

/* ---------- 6. run + preview ---------- */
await new Promise((resolve) => {
  const srv = http.createServer((_, res) => res.end('ok')).listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    const done = (ok, why) => {
      add('run.local_server', 'REQUIRED', ok ? 'PASS' : 'FAIL', ok ? `can run a server and reach it on localhost:${port}` : `cannot run/reach a local server (${why})`);
      srv.close(resolve);
    };
    http.get({ host: '127.0.0.1', port, path: '/', timeout: 4000 }, (res) => { res.resume(); done(res.statusCode === 200, `status ${res.statusCode}`); })
      .on('error', (e) => done(false, e.code ?? e.message)).on('timeout', function () { this.destroy(); });
  });
});
const csp = process.env.CODESPACE_NAME;
add('preview.human', 'REQUIRED', csp || (inRepo && /github\.com/.test(git(['remote', 'get-url', 'origin']).stdout)) ? 'PASS' : 'FAIL',
  csp ? `Codespaces port forwarding: https://${csp}-4173.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev'}`
    : 'no inbound port: a human can only preview a deployed branch. Needs a Git-integrated host (Cloudflare Pages / Vercel / Netlify) watching this GitHub repo. Confirm a preview URL exists for the first pushed branch.');

/* ---------- report ---------- */
const ICON = { PASS: '✔', FAIL: '✘', WARN: '!', INFO: 'i', SKIP: '-' };
for (const r of results) console.log(`${ICON[r.status] ?? '?'} [${r.level.padEnd(11)}] ${r.id.padEnd(20)} ${r.detail}`);
const failed = results.filter((r) => r.level === 'REQUIRED' && r.status === 'FAIL').map((r) => r.id);
const verdict = failed.length ? 'BLOCKED' : 'READY';
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ verdict, failedRequired: failed, at: new Date().toISOString(), host: os.hostname(), results }, null, 2));
console.log(`\nVERDICT: ${verdict}${failed.length ? ` — failed REQUIRED: ${failed.join(', ')}` : ''}\nevidence: ${OUT}`);
process.exit(failed.length ? 1 : 0);
