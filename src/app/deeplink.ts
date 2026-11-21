/** Share-link state <-> query string. Strict: every value is validated, anything invalid is dropped and reported, never trusted. */
export type Scenario = 'ssp119' | 'ssp245' | 'ssp585';
export interface ShareState { chapter?: string; view?: 'three' | 'cesium'; lat?: number; lon?: number; alt?: number; layers?: string[]; date?: string; scenario?: Scenario }

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SCENARIOS: Scenario[] = ['ssp119', 'ssp245', 'ssp585'];
const num = (v: string | null) => (v !== null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) && s >= '1880-01-01' && s <= '2100-12-31';
const r = (x: number, d: number) => Number(x.toFixed(d));

export function toQuery(s: ShareState): string {
  const p = new URLSearchParams();
  if (s.chapter) p.set('c', s.chapter);
  if (s.view) p.set('view', s.view);
  if (s.lat !== undefined) p.set('lat', String(r(s.lat, 4)));
  if (s.lon !== undefined) p.set('lon', String(r(s.lon, 4)));
  if (s.alt !== undefined) p.set('alt', String(Math.round(s.alt)));
  if (s.layers?.length) p.set('l', s.layers.join(','));
  if (s.date) p.set('d', s.date);
  if (s.scenario) p.set('s', s.scenario);
  return p.toString();
}

export function fromQuery(q: string | URLSearchParams): { state: ShareState; errors: string[] } {
  const p = typeof q === 'string' ? new URLSearchParams(q) : q, state: ShareState = {}, errors: string[] = [];
  const c = p.get('c'); if (c !== null) { if (ID.test(c)) state.chapter = c; else errors.push('c'); }
  const view = p.get('view'); if (view !== null) { if (view === 'three' || view === 'cesium') state.view = view; else errors.push('view'); }
  const lat = num(p.get('lat')); if (p.has('lat')) { if (lat !== null && lat >= -90 && lat <= 90) state.lat = r(lat, 4); else errors.push('lat'); }
  const lon = num(p.get('lon')); if (p.has('lon')) { if (lon !== null && lon >= -180 && lon <= 180) state.lon = r(lon, 4); else errors.push('lon'); }
  const alt = num(p.get('alt')); if (p.has('alt')) { if (alt !== null && alt >= 100 && alt <= 40_000_000) state.alt = Math.round(alt); else errors.push('alt'); }
  const l = p.get('l'); if (l !== null) { const ids = l.split(','); if (ids.length <= 6 && ids.every((x) => ID.test(x))) state.layers = ids; else errors.push('l'); }
  const d = p.get('d'); if (d !== null) { if (validDate(d)) state.date = d; else errors.push('d'); }
  const s = p.get('s'); if (s !== null) { if ((SCENARIOS as string[]).includes(s)) state.scenario = s as Scenario; else errors.push('s'); }
  return { state, errors };
}
