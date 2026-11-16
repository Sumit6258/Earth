#!/usr/bin/env node
/**
 * Build-time texture pipeline (M1a). NASA GIBS Blue Marble (shaded relief + bathymetry) tiles
 * -> one equirectangular mosaic -> JPEG tiers + a provenance manifest (public/data/manifest.json).
 * The layer is static (no time dimension). About 50 polite sequential requests. Outputs are git-ignored and cached in CI.
 * KTX2/Basis compression is the next step (M1b); JPEG gets real imagery on screen first.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { curlDownload } from '../lib/http.mjs';

const LAYER = 'BlueMarble_ShadedRelief_Bathymetry', TMS = '500m', LEVEL = 3;
const BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
const TILE = 512, SPAN = 288 / 2 ** LEVEL; // an EPSG:4326 level-0 tile spans 288 degrees
const COLS = Math.round(360 / SPAN), ROWS = Math.round(180 / SPAN);
if (COLS * SPAN !== 360 || ROWS * SPAN !== 180) throw new Error(`level ${LEVEL} does not tile the world exactly`);
const CACHE = '.cache/gibs-tiles', OUT = 'public/textures', MANIFEST = 'public/data/manifest.json';
const TIERS = [['4k', 4096, 2048], ['2k', 2048, 1024], ['1k', 1024, 512]];

if (!process.env.FORCE && fs.existsSync(MANIFEST) && TIERS.every(([id]) => fs.existsSync(`${OUT}/earth_day_${id}.jpg`))) {
  console.log('textures already built (set FORCE=1 to rebuild)');
  process.exit(0);
}

fs.mkdirSync(CACHE, { recursive: true });
const composites = [];
let fetched = 0;
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const file = path.join(CACHE, `${LAYER}_L${LEVEL}_${row}_${col}.jpg`);
    if (!fs.existsSync(file)) {
      const d = curlDownload(`${BASE}/${LAYER}/default/${TMS}/${LEVEL}/${row}/${col}.jpeg`, file, { timeout: 60 });
      if (!d.ok) { fs.rmSync(file, { force: true }); throw new Error(`tile ${row}/${col} failed: ${d.error}`); }
      fetched++;
    }
    const m = await sharp(file).metadata();
    if (m.format !== 'jpeg' || m.width !== TILE || m.height !== TILE) throw new Error(`tile ${row}/${col} is not a ${TILE}px JPEG (${m.format} ${m.width}x${m.height})`);
    composites.push({ input: file, left: col * TILE, top: row * TILE });
  }
}

const mosaic = await sharp({ create: { width: COLS * TILE, height: ROWS * TILE, channels: 3, background: '#000000' } }).composite(composites).png().toBuffer();
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
const now = new Date().toISOString();
const textures = [];
for (const [id, w, h] of TIERS) {
  const file = `${OUT}/earth_day_${id}.jpg`;
  await sharp(mosaic).resize(w, h, { kernel: 'lanczos3' }).jpeg({ quality: 88, mozjpeg: true }).toFile(file);
  const buf = fs.readFileSync(file);
  textures.push({
    id: `earth_day_${id}`, file: `textures/earth_day_${id}.jpg`, width: w, height: h,
    source: 'NASA Global Imagery Browse Services (GIBS)', layer: LAYER, projection: 'EPSG:4326', tileMatrixSet: TMS, level: LEVEL, tiles: ROWS * COLS,
    date: 'static composite (the layer has no time dimension)', retrievedAt: now,
    license: 'NASA open data policy; credit NASA GIBS and NASA Earth Observatory (Blue Marble)',
    attribution: 'Imagery: NASA GIBS, Blue Marble shaded relief and bathymetry',
    sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length,
  });
}
fs.writeFileSync(MANIFEST, JSON.stringify({ generatedAt: now, textures }, null, 2));
console.log(`built ${textures.length} textures from ${ROWS * COLS} tiles (${fetched} downloaded): ${textures.map((t) => `${t.id} ${(t.bytes / 1e6).toFixed(2)} MB`).join(', ')}`);
