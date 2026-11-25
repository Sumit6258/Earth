import * as THREE from 'three';
import { EarthStage } from './render/three/EarthStage';
import { subsolarPoint } from './geo/sky';
import { fromQuery } from './app/deeplink';
import { initCo2 } from './ui/co2-panel';
import { cesiumHref, clampThreeAlt } from './app/links';

type Tier = 'high' | 'balanced' | 'performance';
const TIERS: Record<Tier, { tex: string[]; dpr: number; lonSeg: number; latSeg: number; atmoView: number; atmoLight: number }> = {
  high: { tex: ['1k', '4k'], dpr: 2, lonSeg: 192, latSeg: 96, atmoView: 16, atmoLight: 6 },
  balanced: { tex: ['1k', '2k'], dpr: 1.5, lonSeg: 128, latSeg: 64, atmoView: 10, atmoLight: 4 },
  performance: { tex: ['1k'], dpr: 1, lonSeg: 96, latSeg: 48, atmoView: 8, atmoLight: 3 },
};
const TIME_RATE = 600; // simulated seconds per real second: a full day in 2.4 minutes

interface DatasetEntry { id: string; title: string; source: string; url: string; coverage: string; units: string; retrievedAt: string; license: string; kind: string }
interface Manifest { textures: TextureEntry[]; datasets?: DatasetEntry[]; unavailable?: Record<string, string> }
interface TextureEntry { id: string; file: string; source: string; layer: string; retrievedAt: string; license: string; attribution: string }

const params = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const shared = fromQuery(params).state; // a validated view carried over from the Cesium page
const asked = params.get('q');
const tier: Tier = asked === 'high' || asked === 'balanced' || asked === 'performance' ? asked
  : (navigator.hardwareConcurrency ?? 8) <= 4 ? 'performance' : /Mobi|Android/i.test(navigator.userAgent) ? 'balanced' : 'high';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
let stage: EarthStage | null = null;
let resolveReady!: () => void;
const ready = new Promise<void>((r) => { resolveReady = r; });

const emptyStats = { running: false, frames: 0, disposed: false, programs: 0, programNames: [] as string[], shaderErrors: 0, drawCalls: 0 };
if (params.get('test') === '1') {
  // Honest test hook: real engine state only. Methods for features that do not exist yet are simply absent.
  (window as unknown as { __EARTH__?: unknown }).__EARTH__ = {
    ready,
    stage: () => ({ active: 'three', opacity: { three: 1, cesium: 0 }, three: stage ? stage.stats() : emptyStats, cesium: { running: false, frames: 0, tilesLoaded: false, ellipsoid: '', imagery: [] } }),
    rig: () => stage?.rig(),
    quality: () => tier,
    motion: () => ({ reduced, autoRotateRate: reduced ? 0 : TIME_RATE, maxTransitionMs: reduced ? 0 : 1500 }),
  };
}

$('#build').textContent = `build ${__BUILD_SHA__} · ${__BUILD_TIME__.slice(0, 16).replace('T', ' ')} UTC`;

function hasWebGL2(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

async function loadManifest(): Promise<Manifest> {
  const r = await fetch('data/manifest.json');
  if (!r.ok) throw new Error(`manifest HTTP ${r.status}`);
  return (await r.json()) as Manifest;
}

function fillTable(rows: TextureEntry[], datasets: DatasetEntry[] = []) {
  const body = $('#dataset-rows');
  body.replaceChildren();
  const all = [...rows.map((t) => [t.id, t.layer, t.source, t.retrievedAt.slice(0, 10), t.license]), ...datasets.map((d) => [d.id, `${d.title} (${d.coverage}; ${d.units})`, d.source, d.retrievedAt.slice(0, 10), d.license])];
  for (const cells of all) {
    const tr = document.createElement('tr');
    for (const v of cells) {
      const td = document.createElement('td');
      td.textContent = v;
      tr.append(td);
    }
    body.append(tr);
  }
}

function showFallback(reason: string) {
  $('#nogl-fallback').hidden = false;
  $<HTMLDetailsElement>('#sources').open = true;
  $('#status').textContent = reason;
  resolveReady();
}

async function boot() {
  const mf = await loadManifest().catch(() => ({ textures: [] }) as Manifest);
  const manifest = mf.textures;
  fillTable(manifest, mf.datasets);
  void initCo2(mf);
  if (!hasWebGL2()) return showFallback('This browser cannot run WebGL 2, so the 3D globe is unavailable. The data sources are listed below.');
  const t = TIERS[tier];
  stage = new EarthStage($<HTMLCanvasElement>('#c'), { dpr: t.dpr, lonSeg: t.lonSeg, latSeg: t.latSeg, timeRate: reduced ? 0 : TIME_RATE, atmoView: t.atmoView, atmoLight: t.atmoLight });
  if (shared.lat !== undefined && shared.lon !== undefined && shared.alt !== undefined) stage.setRig({ lon: shared.lon, lat: shared.lat, alt: clampThreeAlt(shared.alt) });
  startLinks();
  const loader = new THREE.TextureLoader();
  let first = true;
  for (const size of t.tex) {
    try { stage.setMap(await loader.loadAsync(`textures/earth_day_${size}.jpg`)); } catch (e) { if (first) throw e; break; }
    if (first) {
      first = false;
      stage.start();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const when = manifest[0]?.retrievedAt.slice(0, 10) ?? 'unknown date';
      const night = manifest.find((x) => x.id.startsWith('earth_night_'));
      const clouds = manifest.find((x) => x.id.startsWith('earth_clouds_')) as (TextureEntry & { date?: string }) | undefined;
      $('#status').textContent = `NASA GIBS imagery retrieved ${when} · night lights: ${night ? night.layer : `unavailable (${mf.unavailable?.night ?? 'not built'})`} · clouds: ${clouds ? `MODIS ${clouds.date}` : `unavailable (${mf.unavailable?.clouds ?? 'not built'})`} · Sun position is real, time runs ×${reduced ? 0 : TIME_RATE}`;
      startClock();
      resolveReady();
    }
  }
  if (manifest.some((x) => x.id.startsWith('earth_night_'))) {
    for (const size of t.tex) {
      try { stage.setNightMap(await loader.loadAsync(`textures/earth_night_${size}.jpg`)); } catch { break; }
    }
  }
  await loadClouds(t, manifest);
}

async function loadClouds(t: (typeof TIERS)[Tier], manifest: TextureEntry[]) {
  if (!stage || !manifest.some((x) => x.id.startsWith('earth_clouds_'))) return;
  const loader = new THREE.TextureLoader();
  for (const size of t.tex) {
    try { stage.setCloudMap(await loader.loadAsync(`textures/earth_clouds_${size}.jpg`)); } catch { break; }
  }
}

/** The opening's invitation, and a link that carries the current camera position to the zoomable imagery. */
function startLinks() {
  const zoom = $<HTMLAnchorElement>('#zoom'), explore = $<HTMLButtonElement>('#explore');
  explore.addEventListener('click', () => {
    const r = stage?.rig();
    if (stage && r) stage.flyTo({ ...r, alt: 3_500_000 }, reduced ? 1 : 2400);
  });
  const update = () => { const r = stage?.rig(); if (r) zoom.href = cesiumHref(r); };
  update();
  setInterval(update, 500);
}

/** Small observational readout: the simulated UTC instant and where the Sun is overhead. */
function startClock() {
  const el = $('#clock');
  const tick = () => {
    if (!stage) return;
    const d = stage.simDate(), s = subsolarPoint(d);
    el.textContent = `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC · Sun overhead ${Math.abs(s.lat).toFixed(1)}°${s.lat < 0 ? 'S' : 'N'} ${Math.abs(s.lon).toFixed(1)}°${s.lon < 0 ? 'W' : 'E'}`;
  };
  tick();
  setInterval(tick, 500);
}

boot().catch((e: unknown) => {
  $('#status').textContent = `Surface imagery could not be loaded (${e instanceof Error ? e.message : String(e)}). Nothing is drawn rather than a fake planet.`;
  resolveReady();
});
