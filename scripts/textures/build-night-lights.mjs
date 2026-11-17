#!/usr/bin/env node
/**
 * Night-side city lights from NASA GIBS (the Black Marble family). The layer id is DISCOVERED from the live
 * capabilities, never assumed, and its own ResourceURL template is used to fetch tiles.
 * Fail-soft by design: no usable layer means no night texture, and the site says "night lights: unavailable".
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { curlDownload } from '../lib/http.mjs';
import { parseCapabilities, SHORTLIST, DISCOVER } from '../gibs-catalog.mjs';

const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
const LEVEL = 3, TILE = 512, COLS = 10, ROWS = 5; // same grid as the day texture
const CACHE = '.cache/gibs-tiles', OUT = 'public/textures', MANIFEST = 'public/data/manifest.json';
const TIERS = [['4k', 4096, 2048], ['2k', 2048, 1024], ['1k', 1024, 512]];

const m0 = (() => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return null; } })();
if (!m0) throw new Error('build the day textures first (manifest missing)');
if (!process.env.FORCE && m0.textures.some((t) => t.id.startsWith('earth_night_')) && TIERS.every(([id]) => fs.existsSync(`${OUT}/earth_night_${id}.jpg`))) {
  console.log('night textures already built (set FORCE=1 to rebuild)');
  process.exit(0);
}

fs.mkdirSync(CACHE, { recursive: true });
const capFile = path.join(CACHE, 'gibs-4326-capabilities.xml');
if (!fs.existsSync(capFile)) {
  const d = curlDownload(`${BASE}/1.0.0/WMTSCapabilities.xml`, capFile, { timeout: 180 });
  if (!d.ok) { console.warn(`capabilities download failed (${d.error}); continuing without night lights`); process.exit(0); }
}
const cap = parseCapabilities(fs.readFileSync(capFile, 'utf8'));
const usable = (i) => cap.layers[i]?.template && cap.layers[i].tileMatrixSets.some((t) => (cap.tileMatrixSets[t]?.levels ?? 0) > LEVEL);
const candidates = [...new Set([...SHORTLIST.night, ...Object.keys(cap.layers).filter((i) => DISCOVER.night.test(i))])];
const id = candidates.find(usable);
if (!id) { console.warn(`no usable night-lights layer among: ${candidates.join(', ') || '(none)'}; continuing without night lights`); process.exit(0); }

const L = cap.layers[id];
const tms = ['500m', '1km', '2km'].find((t) => L.tileMatrixSets.includes(t) && (cap.tileMatrixSets[t]?.levels ?? 0) > LEVEL) ?? L.tileMatrixSets.find((t) => (cap.tileMatrixSets[t]?.levels ?? 0) > LEVEL);
const time = L.time?.default;
const ext = ((/\.(png|jpe?g)$/i.exec(L.template) ?? [])[1] ?? 'png').toLowerCase().replace('jpeg', 'jpg');
console.log(`night layer: ${id} (${tms}, ${time ?? 'no time dimension'}, .${ext})`);

let missing = 0;
const composites = [];
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const file = path.join(CACHE, `${id}_L${LEVEL}_${row}_${col}.${ext}`);
    if (!fs.existsSync(file)) {
      const url = L.template.replace('{Time}', time ?? 'default').replace('{TileMatrixSet}', tms).replace('{TileMatrix}', String(LEVEL)).replace('{TileRow}', String(row)).replace('{TileCol}', String(col));
      if (!curlDownload(url, file, { timeout: 60 }).ok) { fs.rmSync(file, { force: true }); missing++; continue; }
    }
    try {
      const m = await sharp(file).metadata();
      if (m.width !== TILE || m.height !== TILE) throw new Error('bad tile size');
      composites.push({ input: file, left: col * TILE, top: row * TILE });
    } catch { fs.rmSync(file, { force: true }); missing++; }
  }
}
if (missing > ROWS * COLS * 0.6) { console.warn(`${missing}/${ROWS * COLS} tiles unavailable for ${id}; continuing without night lights`); process.exit(0); }

const mosaic = await sharp({ create: { width: COLS * TILE, height: ROWS * TILE, channels: 3, background: '#000000' } }).composite(composites).png().toBuffer();
const now = new Date().toISOString();
const entries = [];
for (const [tier, w, h] of TIERS) {
  const file = `${OUT}/earth_night_${tier}.jpg`;
  await sharp(mosaic).resize(w, h, { kernel: 'lanczos3' }).jpeg({ quality: 90, mozjpeg: true }).toFile(file);
  const buf = fs.readFileSync(file);
  entries.push({
    id: `earth_night_${tier}`, file: `textures/earth_night_${tier}.jpg`, width: w, height: h,
    source: 'NASA Global Imagery Browse Services (GIBS)', layer: id, layerTitle: L.title ?? id, projection: 'EPSG:4326', tileMatrixSet: tms, level: LEVEL, tiles: ROWS * COLS - missing,
    date: time ?? 'static composite (no time dimension)', retrievedAt: now,
    license: "NASA open data policy; credit NASA GIBS and the layer's data provider (see the GIBS layer metadata)",
    attribution: `Night lights: NASA GIBS layer ${id}`,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length,
  });
}
fs.writeFileSync(MANIFEST, JSON.stringify({ ...m0, textures: [...m0.textures.filter((t) => !t.id.startsWith('earth_night_')), ...entries] }, null, 2));
console.log(`built ${entries.length} night textures from ${id} (${ROWS * COLS - missing}/${ROWS * COLS} tiles)`);
