#!/usr/bin/env node
/**
 * EARTH · GIBS catalog snapshot (M0). Establishes — from the live service, not from memory — which layers exist,
 * their formats, tile matrix sets and date coverage, and discovers replacements for any shortlisted layer that is missing.
 *
 *   node scripts/gibs-catalog.mjs                       download capabilities (EPSG:4326 + 3857, "best") and snapshot
 *   node scripts/gibs-catalog.mjs --offline cap.xml     parse a saved capabilities file
 *   node scripts/gibs-catalog.mjs --selftest            parser self-test, no network
 *
 * Writes docs/evidence/M0/gibs-catalog.json (commit it) and prints a summary table.
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlDownload, curlText } from './lib/http.mjs';

const BASE = 'https://gibs.earthdata.nasa.gov/wmts';
const OUT = 'docs/evidence/M0/gibs-catalog.json';

/** Candidate layers per role, in order of preference. IDs are CANDIDATES until this script confirms them. */
export const SHORTLIST = {
  baseDay: ['BlueMarble_ShadedRelief_Bathymetry', 'BlueMarble_NextGeneration', 'BlueMarble_ShadedRelief'],
  trueColor: ['MODIS_Terra_CorrectedReflectance_TrueColor', 'MODIS_Aqua_CorrectedReflectance_TrueColor', 'VIIRS_SNPP_CorrectedReflectance_TrueColor', 'VIIRS_NOAA20_CorrectedReflectance_TrueColor'],
  night: ['VIIRS_Black_Marble', 'BlackMarble_2016', 'BlackMarble_2012', 'VIIRS_SNPP_DayNightBand_ENCC'],
  fires: ['VIIRS_NOAA20_Thermal_Anomalies_375m_All', 'VIIRS_NOAA21_Thermal_Anomalies_375m_All', 'VIIRS_SNPP_Thermal_Anomalies_375m_All', 'MODIS_Terra_Thermal_Anomalies_All'],
  sst: ['GHRSST_L4_MUR_Sea_Surface_Temperature', 'GHRSST_L4_G1SST_Sea_Surface_Temperature'],
  seaIce: ['AMSR2_Sea_Ice_Concentration_12km', 'AMSRU2_Sea_Ice_Concentration_12km', 'MODIS_Terra_Sea_Ice'],
  vegetation: ['MODIS_Terra_NDVI_8Day', 'MODIS_Terra_EVI_8Day'],
  clouds: ['MODIS_Terra_Cloud_Fraction_Day'],
};
/** Patterns used to discover replacements / unknowns (e.g. a CO2 layer, if GIBS has one). */
export const DISCOVER = {
  night: /black.?marble|daynight|night.?light/i,
  fires: /thermal_anomalies/i,
  seaIce: /sea_ice/i,
  co2: /carbon_dioxide|(^|_)co2|xco2/i,
  sst: /sea_surface_temp/i,
  temperature: /temp.*anomal|anomal.*temp|surface_air_temp/i,
  landcover: /land_cover|tree_cover|forest/i,
};

const pick = (s, re) => (re.exec(s) ?? [])[1];

/** Parse WMTS capabilities (regex-based on purpose: no XML dependency). */
export function parseCapabilities(xml) {
  const layers = {};
  for (const m of xml.matchAll(/<Layer>([\s\S]*?)<\/Layer>/g)) {
    const b = m[1];
    const head = b.replace(/<Style[\s\S]*?<\/Style>/g, '').replace(/<Dimension>[\s\S]*?<\/Dimension>/g, '');
    const id = pick(head, /<ows:Identifier>([^<]+)<\/ows:Identifier>/);
    if (!id) continue;
    const dim = /<Dimension>([\s\S]*?)<\/Dimension>/.exec(b)?.[1];
    layers[id] = {
      id,
      title: pick(head, /<ows:Title[^>]*>([^<]*)<\/ows:Title>/),
      formats: [...b.matchAll(/<Format>([^<]+)<\/Format>/g)].map((x) => x[1]),
      tileMatrixSets: [...b.matchAll(/<TileMatrixSetLink>\s*<TileMatrixSet>([^<]+)<\/TileMatrixSet>/g)].map((x) => x[1]),
      time: dim ? { default: pick(dim, /<Default>([^<]+)<\/Default>/), values: [...dim.matchAll(/<Value>([^<]+)<\/Value>/g)].flatMap((x) => x[1].split(',')) } : null,
      template: pick(b, /<ResourceURL[^>]*template="([^"]+)"/),
    };
  }
  const tileMatrixSets = {};
  for (const m of xml.matchAll(/<TileMatrixSet>\s*<ows:Identifier>([^<]+)<\/ows:Identifier>([\s\S]*?)<\/TileMatrixSet>/g)) {
    const matrices = [...m[2].matchAll(/<TileMatrix>([\s\S]*?)<\/TileMatrix>/g)].map((t) => ({
      id: pick(t[1], /<ows:Identifier>([^<]+)</),
      scaleDenominator: Number(pick(t[1], /<ScaleDenominator>([^<]+)</)),
      topLeft: pick(t[1], /<TopLeftCorner>([^<]+)</),
      tileWidth: Number(pick(t[1], /<TileWidth>([^<]+)</)),
      matrixWidth: Number(pick(t[1], /<MatrixWidth>([^<]+)</)),
      matrixHeight: Number(pick(t[1], /<MatrixHeight>([^<]+)</)),
    }));
    tileMatrixSets[m[1]] = { crs: pick(m[2], /<ows:SupportedCRS>([^<]+)</), levels: matrices.length, matrices };
  }
  return { layers, tileMatrixSets };
}

/** Summarise ISO-8601 interval strings like "2002-06-01/2026-11-13/P1D". */
export function summarizeTime(values) {
  const segs = (values ?? []).map((v) => v.split('/')).filter((p) => p.length >= 2);
  if (!segs.length) return null;
  const starts = segs.map((p) => p[0]).sort();
  const ends = segs.map((p) => p[1]).sort();
  return { first: starts[0], last: ends[ends.length - 1], period: segs[segs.length - 1][2] ?? null, segments: segs.length };
}

/** Degrees per pixel at a tile matrix (EPSG:4326 only) — used to confirm the 288° level-0 quirk. */
export const degPerPixel = (m) => (m.scaleDenominator * 0.00028) / 111319.49079327358;

function report(cap, label) {
  const roles = {};
  for (const [role, ids] of Object.entries(SHORTLIST)) {
    const found = ids.filter((id) => cap.layers[id]);
    roles[role] = { chosen: found[0] ?? null, found, missing: ids.filter((id) => !cap.layers[id]) };
  }
  const discovered = {};
  for (const [k, re] of Object.entries(DISCOVER)) {
    discovered[k] = Object.values(cap.layers).filter((l) => re.test(l.id)).slice(0, 25)
      .map((l) => ({ id: l.id, tms: l.tileMatrixSets, formats: l.formats, time: summarizeTime(l.time?.values) }));
  }
  const tms = Object.fromEntries(Object.entries(cap.tileMatrixSets).map(([k, v]) => [k, {
    crs: v.crs, levels: v.levels,
    level0: v.matrices[0] ? { matrixWidth: v.matrices[0].matrixWidth, matrixHeight: v.matrices[0].matrixHeight, tileWidth: v.matrices[0].tileWidth, topLeft: v.matrices[0].topLeft, degPerPixel: /4326|CRS:84/.test(v.crs ?? '') ? degPerPixel(v.matrices[0]) : undefined } : null,
  }]));
  const shortlisted = Object.fromEntries(Object.values(roles).flatMap((r) => r.found).map((id) => [id, { ...cap.layers[id], time: cap.layers[id].time && { default: cap.layers[id].time.default, ...summarizeTime(cap.layers[id].time.values) } }]));
  return { label, layerCount: Object.keys(cap.layers).length, roles, shortlisted, discovered, tileMatrixSets: tms };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) return selftest();
  const snapshots = [];
  const offline = args[args.indexOf('--offline') + 1];
  const sources = offline && args.includes('--offline') ? [['offline', offline]] : [['epsg4326', `${BASE}/epsg4326/best/1.0.0/WMTSCapabilities.xml`], ['epsg3857', `${BASE}/epsg3857/best/1.0.0/WMTSCapabilities.xml`]];
  for (const [label, src] of sources) {
    let file = src;
    if (/^https?:/.test(src)) {
      file = path.join('docs/evidence/M0', `gibs-${label}-capabilities.xml`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const d = curlDownload(src, file);
      if (!d.ok) { console.error(`✘ could not download ${src}: ${d.error}`); process.exitCode = 1; continue; }
    }
    snapshots.push(report(parseCapabilities(fs.readFileSync(file, 'utf8')), label));
  }
  if (!snapshots.length) { console.error('✘ no snapshot produced, so no evidence file was written. Fix network access (see preflight) and re-run.'); process.exit(1); }
  // Authoritative date coverage for the chosen time-varying layers (capabilities only lists the latest 100 periods).
  for (const s of snapshots.filter((x) => x.label === 'epsg4326')) {
    for (const [id, l] of Object.entries(s.shortlisted)) {
      if (!l.time) continue;
      const r = curlText(`${BASE}/epsg4326/best/1.0.0/${id}/default/${l.tileMatrixSets[0]}/all/all.xml`, { timeout: 30 });
      const dom = /<Domain>([^<]+)<\/Domain>/.exec(r.text)?.[1];
      l.domainCoverage = dom ? summarizeTime(dom.split(',')) : { error: r.error ?? `HTTP ${r.status}` };
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), snapshots }, null, 2));
  for (const s of snapshots) {
    console.log(`\n== ${s.label}: ${s.layerCount} layers`);
    for (const [role, r] of Object.entries(s.roles)) console.log(`${r.chosen ? '✔' : '✘'} ${role.padEnd(10)} ${r.chosen ?? 'NOT FOUND — see discovered.' + role}  (missing: ${r.missing.join(', ') || 'none'})`);
    for (const k of ['co2', 'night', 'seaIce', 'temperature']) console.log(`  discovered.${k}: ${s.discovered[k].map((d) => d.id).slice(0, 6).join(', ') || 'none'}`);
  }
  console.log(`\nevidence: ${OUT}`);
}

function selftest() {
  const xml = `<Capabilities><Contents>
  <Layer><ows:Title xml:lang="en">Sea Surface Temperature</ows:Title><ows:Identifier>GHRSST_L4_MUR_Sea_Surface_Temperature</ows:Identifier>
    <Style isDefault="true"><ows:Identifier>default</ows:Identifier></Style><Format>image/png</Format>
    <Dimension><ows:Identifier>time</ows:Identifier><UOM>ISO8601</UOM><Default>2026-11-12</Default><Current>false</Current><Value>2002-06-01/2026-11-12/P1D</Value></Dimension>
    <TileMatrixSetLink><TileMatrixSet>1km</TileMatrixSet></TileMatrixSetLink>
    <ResourceURL format="image/png" resourceType="tile" template="https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/GHRSST_L4_MUR_Sea_Surface_Temperature/default/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png"/></Layer>
  <Layer><ows:Identifier>BlueMarble_ShadedRelief_Bathymetry</ows:Identifier><Style><ows:Identifier>default</ows:Identifier></Style><Format>image/jpeg</Format>
    <TileMatrixSetLink><TileMatrixSet>500m</TileMatrixSet></TileMatrixSetLink></Layer>
  <TileMatrixSet><ows:Identifier>500m</ows:Identifier><ows:SupportedCRS>urn:ogc:def:crs:OGC:1.3:CRS84</ows:SupportedCRS>
    <TileMatrix><ows:Identifier>0</ows:Identifier><ScaleDenominator>223632905.6114871</ScaleDenominator><TopLeftCorner>-180 90</TopLeftCorner><TileWidth>512</TileWidth><TileHeight>512</TileHeight><MatrixWidth>2</MatrixWidth><MatrixHeight>1</MatrixHeight></TileMatrix>
  </TileMatrixSet></Contents></Capabilities>`;
  const cap = parseCapabilities(xml);
  const t = (c, m) => { if (!c) { console.error('✘ selftest failed:', m); process.exit(1); } };
  t(Object.keys(cap.layers).length === 2, 'two layers parsed');
  const sst = cap.layers.GHRSST_L4_MUR_Sea_Surface_Temperature;
  t(sst.formats[0] === 'image/png' && sst.tileMatrixSets[0] === '1km', 'format + tms');
  t(sst.time.default === '2026-11-12' && summarizeTime(sst.time.values).first === '2002-06-01', 'time dimension');
  t(cap.layers.BlueMarble_ShadedRelief_Bathymetry.time === null, 'static layer has no time');
  t(cap.tileMatrixSets['500m'].levels === 1 && cap.tileMatrixSets['500m'].matrices[0].matrixWidth === 2, 'tile matrix set');
  t(Math.abs(degPerPixel(cap.tileMatrixSets['500m'].matrices[0]) - 0.5625) < 1e-6, 'degPerPixel formula (0.5625 deg/px at level 0, i.e. 288 deg per 512px tile)');
  const rep = report(cap, 'selftest');
  t(rep.roles.sst.chosen === 'GHRSST_L4_MUR_Sea_Surface_Temperature' && rep.roles.night.chosen === null, 'shortlist matching');
  console.log('✔ gibs-catalog parser self-test passed (synthetic XML; real capabilities still need the M0 run)');
}

main();
