#!/usr/bin/env node
/**
 * Atmospheric CO2 at Mauna Loa (NOAA Global Monitoring Laboratory) -> public/data/co2-mlo.json + a provenance entry in the manifest.
 * Fail-soft with a recorded reason: the site then says "unavailable (why)" instead of showing numbers it does not have.
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlText } from '../lib/http.mjs';
import { readManifest, writeManifest, markUnavailable, clearUnavailable } from '../lib/manifest.mjs';
import { parseAnnualCsv, parseMonthlyCsv } from './co2-parse.mjs';

for (const ev of ['uncaughtException', 'unhandledRejection']) {
  process.on(ev, (e) => { markUnavailable('co2', `script error: ${e?.message ?? e}`); process.exit(0); });
}
const BASE = process.env.GML_BASE ?? 'https://gml.noaa.gov/webdata/ccgg/trends/co2';
const OUT = 'public/data/co2-mlo.json';
const m0 = readManifest() ?? { generatedAt: new Date().toISOString(), textures: [] };
if (!fs.existsSync('public/data/manifest.json')) writeManifest(m0);

const get = (file) => { const r = curlText(`${BASE}/${file}`, { timeout: 60 }); return r.status === 200 ? r.text : null; };
const annualText = get('co2_annmean_mlo.csv');
if (!annualText) { markUnavailable('co2', `could not download co2_annmean_mlo.csv from ${BASE}`); process.exit(0); }
const annual = parseAnnualCsv(annualText);
if (annual.length < 40) { markUnavailable('co2', `the annual file parsed to only ${annual.length} rows (format changed?)`); process.exit(0); }
const monthly = parseMonthlyCsv(get('co2_mm_mlo.csv') ?? '');
const latestMonthly = monthly.at(-1) ?? null;

const now = new Date().toISOString();
const data = {
  station: { name: 'Mauna Loa Observatory, Hawaii', lat: 19.5362, lon: -155.5763, elevationM: 3397 },
  annual, latestMonthly, retrievedAt: now,
  source: { name: 'NOAA Global Monitoring Laboratory', url: 'https://gml.noaa.gov/ccgg/trends/', file: `${BASE}/co2_annmean_mlo.csv`, citation: "NOAA Global Monitoring Laboratory, Mauna Loa CO2 record (see the data page for NOAA's requested citation)", license: 'NOAA open data (U.S. Government); cite as requested on the source page' },
  units: 'ppm (dry-air mole fraction), annual mean',
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data));
const entry = { id: 'co2-mlo', title: 'Atmospheric CO2, Mauna Loa', source: data.source.name, url: data.source.url, coverage: `${annual[0].year}–${annual.at(-1).year} (annual means)`, units: data.units, retrievedAt: now, license: data.source.license, kind: 'observed' };
writeManifest(clearUnavailable({ ...m0, datasets: [...(m0.datasets ?? []).filter((d) => d.id !== 'co2-mlo'), entry] }, 'co2'));
console.log(`co2: ${annual.length} annual means ${annual[0].year}-${annual.at(-1).year}; latest monthly ${latestMonthly ? `${latestMonthly.year}-${String(latestMonthly.month).padStart(2, '0')} ${latestMonthly.ppm} ppm` : 'n/a'}`);
