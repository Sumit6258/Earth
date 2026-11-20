#!/usr/bin/env node
/**
 * Night-side city lights from NASA GIBS (Black Marble family).
 * The layer id comes from the live catalog (ids parse reliably); the tile URL variant (grid, extension, date) is found by
 * asking the tile server, so it does not depend on parsing the catalog's URL templates.
 * Fail-soft with a recorded reason: no night texture means the site says "night lights: unavailable (why)".
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { curlDownload } from '../lib/http.mjs';
import { parseCapabilities, SHORTLIST } from '../gibs-catalog.mjs';
import { BASE, tileUrl, probeLayer } from '../lib/gibs-probe.mjs';
import { readManifest, writeManifest, markUnavailable, clearUnavailable } from '../lib/manifest.mjs';

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => { markUnavailable('night', `script error: ${e?.message ?? e}`); process.exit(0); });
}

const LEVEL = 3, TILE = 512, COLS = 10, ROWS = 5;
const CACHE = '.cache/gibs-tiles', OUT = 'public/textures';
const TIERS = [['4k', 4096, 2048], ['2k', 2048, 1024], ['1k', 1024, 512]];

const m0 = readManifest();
if (!m0) throw new Error('build the day textures first (manifest missing)');
if (!process.env.FORCE && m0.textures.some((t) => t.id.startsWith('earth_night_')) && TIERS.every(([id]) => fs.existsSync(`${OUT}/earth_night_${id}.jpg`))) {
  console.log('night textures already built (set FORCE=1 to rebuild)');
  process.exit(0);
}

fs.mkdirSync(CACHE, { recursive: true });
const capFile = path.join(CACHE, 'gibs-4326-capabilities.xml');
if (!fs.existsSync(capFile)) {
  const d = curlDownload(`${BASE}/1.0.0/WMTSCapabilities.xml`, capFile, { timeout: 180 });
  if (!d.ok) { markUnavailable('night', `capabilities download failed: ${d.error}`); process.exit(0); }
}
const cap = parseCapabilities(fs.readFileSync(capFile, 'utf8'));
const ids = Object.keys(cap.layers);
if (!ids.length) { markUnavailable('night', 'the GIBS capabilities parsed to 0 layers'); process.exit(0); }

const priority = [
  ...SHORTLIST.night.filter((i) => ids.includes(i)),
  ...ids.filter((i) => /black.?marble/i.test(i) && !SHORTLIST.night.includes(i)),
  ...ids.filter((i) => /daynight|dnb/i.test(i) && !SHORTLIST.night.includes(i)),
];
const candidates = [...new Set(priority)].slice(0, 6);
if (!candidates.length) {
  const near = ids.filter((i) => /night|marble|lights/i.test(i) && !/temp|mls_|airs|lst|surface/i.test(i)).slice(0, 8).join(', ') || 'none';
  markUnavailable('night', `no Black Marble or DayNightBand layer id among ${ids.length} catalog layers (nearest by name: ${near})`);
  process.exit(0);
}

let chosen = null;
const attempts = [];
for (const id of candidates) {
  const p = probeLayer(id, { dates: [undefined, 'default'] });
  attempts.push(`${id} ${JSON.stringify(p.tried)}`);
  if (p.variant) { chosen = { id, ...p.variant }; break; }
}
if (!chosen) { markUnavailable('night', `the tile server answered no variant for ${candidates.join(', ')} (HTTP codes: ${attempts.join('; ').slice(0, 220)})`); process.exit(0); }
console.log(`night layer: ${chosen.id} (${chosen.tms}, ${chosen.date ?? 'static'}, .${chosen.ext})`);

let missing = 0;
const composites = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const file = path.join(CACHE, `${chosen.id}_${chosen.date ?? 'static'}_L${LEVEL}_${row}_${col}.${chosen.ext}`);
    if (!fs.existsSync(file) && !curlDownload(tileUrl(chosen.id, chosen, LEVEL, row, col), file, { timeout: 60 }).ok) { fs.rmSync(file, { force: true }); missing++; continue; }
    try {
      const m = await sharp(file).metadata();
      if (m.width !== TILE || m.height !== TILE) throw new Error('bad tile size');
      composites.push({ input: file, left: col * TILE, top: row * TILE });
    } catch { fs.rmSync(file, { force: true }); missing++; }
  }
}
if (missing > ROWS * COLS * 0.6) { markUnavailable('night', `${missing}/${ROWS * COLS} tiles of ${chosen.id} could not be fetched`); process.exit(0); }

const mosaic = await sharp({ create: { width: COLS * TILE, height: ROWS * TILE, channels: 3, background: '#000000' } }).composite(composites).png().toBuffer();
const now = new Date().toISOString();
const entries = [];
for (const [tier, w, h] of TIERS) {
  const file = `${OUT}/earth_night_${tier}.jpg`;
  await sharp(mosaic).resize(w, h, { kernel: 'lanczos3' }).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  const buf = fs.readFileSync(file);
  entries.push({
    id: `earth_night_${tier}`, file: `textures/earth_night_${tier}.jpg`, width: w, height: h,
    source: 'NASA Global Imagery Browse Services (GIBS)', layer: chosen.id, layerTitle: cap.layers[chosen.id]?.title ?? chosen.id, projection: 'EPSG:4326', tileMatrixSet: chosen.tms, level: LEVEL, tiles: ROWS * COLS - missing,
    date: chosen.date ?? 'static composite (no time dimension)', retrievedAt: now,
    license: "NASA open data policy; credit NASA GIBS and the layer's data provider (see the GIBS layer metadata)",
    attribution: `Night lights: NASA GIBS layer ${chosen.id}`,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length,
  });
}
writeManifest(clearUnavailable({ ...m0, textures: [...m0.textures.filter((t) => !t.id.startsWith('earth_night_')), ...entries] }, 'night'));
console.log(`built ${entries.length} night textures from ${chosen.id} (${ROWS * COLS - missing}/${ROWS * COLS} tiles)`);
