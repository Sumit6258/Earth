// Asks the GIBS tile server which URL variant works for a layer, instead of trusting a parsed catalog.
// GIBS_BASE can point at a local mock server (used by the offline test of the texture pipeline).
import { curlProbe } from './http.mjs';

export const BASE = process.env.GIBS_BASE ?? 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
export const utcDay = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

/** EPSG:4326 REST tile URL. date undefined = a layer without a time dimension; 'default' = GIBS' "latest" keyword. */
export const tileUrl = (id, v, level, row, col) => `${BASE}/${id}/default/${v.date ? `${v.date}/` : ''}${v.tms}/${level}/${row}/${col}.${v.ext}`;

/** Tries combinations of date, tile matrix set and extension against one land-rich tile (level 3, row 1, col 5). */
export function probeLayer(id, { tmsList = ['500m', '250m', '1km', '2km'], exts = ['png', 'jpeg', 'jpg'], dates = [undefined, 'default'] } = {}) {
  const tried = {};
  for (const date of dates) for (const tms of tmsList) for (const ext of exts) {
    const r = curlProbe(tileUrl(id, { date, tms, ext }, 3, 1, 5), { timeout: 20, range: null });
    const key = r.status || 'no-response';
    tried[key] = (tried[key] ?? 0) + 1;
    if (r.status === 200 && /^image\//.test(r.contentType ?? '')) return { variant: { date, tms, ext }, tried };
  }
  return { variant: null, tried };
}
