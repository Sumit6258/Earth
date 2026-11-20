#!/usr/bin/env node
/**
 * Clouds: a REAL, date-stamped cloud mask from NASA GIBS MODIS Terra + Aqua corrected reflectance, bands 7-2-1.
 * In 7-2-1 snow and ice show cyan while clouds stay white, so snow is not mistaken for cloud. Two sensors over two days
 * are max-composited to fill swath gaps. The tile URL variant (grid, extension) is found by asking the tile server.
 * Fail-soft, with no procedural fallback: if anything is implausible the site says "clouds: unavailable (why)".
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { curlDownload } from '../lib/http.mjs';
import { parseCapabilities } from '../gibs-catalog.mjs';
import { BASE, tileUrl, probeLayer, utcDay } from '../lib/gibs-probe.mjs';
import { readManifest, writeManifest, markUnavailable, clearUnavailable } from '../lib/manifest.mjs';

const LEVEL = 3, TILE = 512, COLS = 10, ROWS = 5, W = COLS * TILE, H = ROWS * TILE;
const CACHE = '.cache/gibs-tiles', OUT = 'public/textures';
const TIERS = [['4k', 4096, 2048], ['2k', 2048, 1024], ['1k', 1024, 512]];
const DAYS_BACK = [1, 2]; // the newest day is often incomplete

export const cloudAlpha = (r, g, b) => { // 0..255: white = cloud; cyan snow has a low red channel, so it scores low
  const t = Math.min(1, Math.max(0, (Math.min(r, g, b) - 80) / 130));
  return Math.round(255 * t * t * (3 - 2 * t));
};

async function main() {
  const m0 = readManifest();
  if (!m0) throw new Error('build the day textures first (manifest missing)');
  if (!process.env.FORCE && m0.textures.some((t) => t.id.startsWith('earth_clouds_')) && TIERS.every(([id]) => fs.existsSync(`${OUT}/earth_clouds_${id}.jpg`))) {
    console.log('cloud textures already built (set FORCE=1 to rebuild)');
    return;
  }
  fs.mkdirSync(CACHE, { recursive: true });
  const capFile = path.join(CACHE, 'gibs-4326-capabilities.xml');
  if (!fs.existsSync(capFile)) curlDownload(`${BASE}/1.0.0/WMTSCapabilities.xml`, capFile, { timeout: 180 });
  const ids = fs.existsSync(capFile) ? Object.keys(parseCapabilities(fs.readFileSync(capFile, 'utf8')).layers) : [];
  const wanted = ['MODIS_Terra_CorrectedReflectance_Bands721', 'MODIS_Aqua_CorrectedReflectance_Bands721'];
  const cands = ids.length ? wanted.filter((i) => ids.includes(i)) : wanted;
  if (!cands.length) {
    markUnavailable('clouds', `neither MODIS Bands721 layer is among the ${ids.length} catalog layers (similar ids: ${ids.filter((i) => /MODIS/.test(i) && /Bands/i.test(i)).slice(0, 8).join(', ') || 'none'})`);
    return;
  }

  const alpha = new Uint8Array(W * H);
  const used = [], dates = new Set(), attempts = [];
  let tiles = 0, missing = 0;
  for (const id of cands) {
    const p = probeLayer(id, { tmsList: ['250m', '500m', '1km', '2km'], exts: ['jpg', 'jpeg', 'png'], dates: [1, 2, 3].map((n) => utcDay(-n)) });
    attempts.push(`${id} ${JSON.stringify(p.tried)}`);
    if (!p.variant) continue;
    const { tms, ext } = p.variant;
    for (const back of DAYS_BACK) {
      const day = utcDay(-back);
      let got = 0;
      for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
        tiles++;
        const file = path.join(CACHE, `${id}_${day}_L${LEVEL}_${row}_${col}.${ext}`);
        if (!fs.existsSync(file) && !curlDownload(tileUrl(id, { date: day, tms, ext }, LEVEL, row, col), file, { timeout: 60 }).ok) { fs.rmSync(file, { force: true }); missing++; continue; }
        try {
          const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
          if (info.width !== TILE || info.height !== TILE) throw new Error('bad tile size');
          for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
            const i = (y * TILE + x) * 3, o = (row * TILE + y) * W + col * TILE + x, a = cloudAlpha(data[i], data[i + 1], data[i + 2]);
            if (a > alpha[o]) alpha[o] = a;
          }
          got++;
        } catch { fs.rmSync(file, { force: true }); missing++; }
      }
      if (got) { used.push(`${id}@${day}`); dates.add(day); }
    }
  }
  if (!used.length) { markUnavailable('clouds', `the tile server answered no variant for ${cands.join(', ')} (HTTP codes: ${attempts.join('; ').slice(0, 220)})`); return; }
  const coverage = alpha.reduce((s, v) => s + v, 0) / (255 * alpha.length);
  if (missing > tiles * 0.5 || coverage < 0.03 || coverage > 0.9) {
    markUnavailable('clouds', `cloud mask rejected: ${used.length} layer-days usable, ${missing}/${tiles} tiles missing, coverage ${(coverage * 100).toFixed(1)}%`);
    return;
  }

  const now = new Date().toISOString(), entries = [];
  for (const [tier, w, h] of TIERS) {
    const file = `${OUT}/earth_clouds_${tier}.jpg`;
    await sharp(alpha, { raw: { width: W, height: H, channels: 1 } }).blur(1.2).resize(w, h, { kernel: 'lanczos3' }).jpeg({ quality: 85 }).toFile(file);
    const buf = fs.readFileSync(file);
    entries.push({
      id: `earth_clouds_${tier}`, file: `textures/earth_clouds_${tier}.jpg`, width: w, height: h, kind: 'derived',
      source: 'NASA Global Imagery Browse Services (GIBS), MODIS Terra and Aqua', layer: used.join(', '), projection: 'EPSG:4326', level: LEVEL,
      date: [...dates].sort().join(' + '), retrievedAt: now,
      license: 'NASA open data policy; credit NASA GIBS and the MODIS science team',
      attribution: `Clouds: cloud mask derived from MODIS corrected reflectance (bands 7-2-1), ${[...dates].sort().join(' and ')}; drift is illustrative`,
      coveragePercent: Math.round(coverage * 1000) / 10, sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length,
    });
  }
  writeManifest(clearUnavailable({ ...m0, textures: [...m0.textures.filter((t) => !t.id.startsWith('earth_clouds_')), ...entries] }, 'clouds'));
  console.log(`built ${entries.length} cloud textures from ${used.join(', ')} (cloud coverage ${(coverage * 100).toFixed(1)}%, ${missing}/${tiles} tiles missing)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((e) => markUnavailable('clouds', `script error: ${e?.message ?? e}`));
}
