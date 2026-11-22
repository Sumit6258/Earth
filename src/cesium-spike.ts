import { gibsUrl, utcDay } from './geo/gibs';
import { fromQuery } from './app/deeplink';
import { globeHref } from './app/links';

// Cesium's workers and assets are served from /cesium/ (copied by scripts/copy-cesium.mjs). Set before Cesium loads.
(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/';

const params = new URLSearchParams(location.search);
const share = fromQuery(params).state; // validated: anything malformed is dropped
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
let resolveReady!: () => void;
const ready = new Promise<void>((r) => { resolveReady = r; });

async function main() {
  const Cesium = await import('cesium'); // lazy chunk: never on the critical path
  await import('cesium/Build/Cesium/Widgets/widgets.css');

  const widget = new Cesium.CesiumWidget($('#globe'), { baseLayer: false }); // no Bing/ion default imagery
  // GIBS EPSG:4326: level 0 is 2x1 tiles of 288 degrees over a (-180,-198)..(396,90) grid. Verified by tests/spike/cesium.spec.ts.
  const scheme = new Cesium.GeographicTilingScheme({ rectangle: Cesium.Rectangle.fromDegrees(-180, -198, 396, 90), numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1 });
  const credit = new Cesium.Credit('NASA Global Imagery Browse Services (GIBS)');
  const provider = (layer: string, tms: string, maxLevel: number, ext: 'jpeg' | 'jpg', date?: string) =>
    new Cesium.WebMapTileServiceImageryProvider({
      url: gibsUrl(layer, ext, date), layer, style: 'default', format: 'image/jpeg', tileMatrixSetID: tms,
      maximumLevel: maxLevel, tileWidth: 512, tileHeight: 512, tilingScheme: scheme, rectangle: Cesium.Rectangle.MAX_VALUE, credit,
    });

  const infos: { id: string; time?: string; urlTemplate: string }[] = [];
  const baseId = 'BlueMarble_ShadedRelief_Bathymetry';
  widget.imageryLayers.addImageryProvider(provider(baseId, '500m', 7, 'jpeg'));
  infos.push({ id: baseId, urlTemplate: gibsUrl(baseId, 'jpeg') });

  let dated: InstanceType<typeof Cesium.ImageryLayer> | null = null;
  const datedId = 'MODIS_Terra_CorrectedReflectance_TrueColor';
  const setDate = (iso: string) => {
    if (dated) widget.imageryLayers.remove(dated, true);
    dated = widget.imageryLayers.addImageryProvider(provider(datedId, '250m', 8, 'jpg', iso));
    const i = infos.findIndex((x) => x.id === datedId);
    const info = { id: datedId, time: iso, urlTemplate: gibsUrl(datedId, 'jpg', iso) };
    if (i >= 0) infos[i] = info; else infos.push(info);
    $('#datenote').textContent = `Showing ${iso} (daily imagery; swath gaps show the Blue Marble beneath).`;
  };
  const unsetDate = () => {
    if (dated) widget.imageryLayers.remove(dated, true);
    dated = null;
    const i = infos.findIndex((x) => x.id === datedId);
    if (i >= 0) infos.splice(i, 1);
    $('#datenote').textContent = '';
  };

  const dateInput = $<HTMLInputElement>('#date'), box = $<HTMLInputElement>('#truecolor');
  dateInput.max = utcDay(-1);
  dateInput.value = share.date ?? utcDay(-1);
  box.addEventListener('change', () => (box.checked ? setDate(dateInput.value) : unsetDate()));
  dateInput.addEventListener('change', () => { if (box.checked && dateInput.value) setDate(dateInput.value); });
  if (share.layers?.includes('truecolor')) { box.checked = true; setDate(dateInput.value); }

  const lon = share.lon ?? 20, lat = share.lat ?? 15, alt = share.alt ?? 12_000_000;
  widget.camera.setView({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt) });

  let frames = 0, last = 0;
  widget.scene.postRender.addEventListener(() => {
    frames++;
    if (frames === 1) { $('#status').textContent = 'NASA GIBS imagery on a WGS84 globe. Drag to rotate, scroll to zoom.'; resolveReady(); }
    const now = performance.now();
    if (now - last < 500) return;
    last = now;
    const c = Cesium.Cartographic.fromCartesian(widget.camera.positionWC);
    if (c) $<HTMLAnchorElement>('#back').href = globeHref({ lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude), alt: c.height });
    if (c) $('#pos').textContent = `${Math.abs(Cesium.Math.toDegrees(c.latitude)).toFixed(2)}°${c.latitude < 0 ? 'S' : 'N'} ${Math.abs(Cesium.Math.toDegrees(c.longitude)).toFixed(2)}°${c.longitude < 0 ? 'W' : 'E'} · height ${(c.height / 1000).toFixed(0)} km`;
  });

  if (params.get('test') === '1') {
    (window as unknown as { __EARTH__?: unknown }).__EARTH__ = {
      ready,
      stage: () => ({
        active: 'cesium', opacity: { three: 0, cesium: 1 },
        three: { running: false, frames: 0, disposed: false, programs: 0, programNames: [], shaderErrors: 0, drawCalls: 0 },
        cesium: { running: true, frames, tilesLoaded: widget.scene.globe.tilesLoaded, ellipsoid: `WGS84 a=${Cesium.Ellipsoid.WGS84.radii.x}`, imagery: infos.map((x) => ({ ...x })) },
      }),
      setDate: async (iso: string) => { box.checked = true; dateInput.value = iso; setDate(iso); },
      /** Raw tile rectangles from Cesium's own tiling scheme (degrees), for the test to compare with GIBS' published grid. */
      tileRects: (list: number[][]) => list.map(([level, x, y]) => {
        const r = scheme.tileXYToRectangle(x, y, level);
        return { level, x, y, west: Cesium.Math.toDegrees(r.west), south: Cesium.Math.toDegrees(r.south), east: Cesium.Math.toDegrees(r.east), north: Cesium.Math.toDegrees(r.north) };
      }),
    };
  }
}

main().catch((e: unknown) => {
  $('#status').textContent = `Cesium could not start: ${e instanceof Error ? e.message : String(e)}`;
  resolveReady();
});
