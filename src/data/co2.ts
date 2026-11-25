export interface Co2Data {
  station: { name: string; lat: number; lon: number; elevationM: number };
  annual: { year: number; ppm: number; unc: number | null }[];
  latestMonthly: { year: number; month: number; ppm: number } | null;
  source: { name: string; url: string; citation: string; license: string };
  units: string; retrievedAt: string;
}
export type Co2Reading = { kind: 'observed'; year: number; ppm: number; unc: number | null } | { kind: 'none'; reason: string };

export async function loadCo2(): Promise<Co2Data> {
  const r = await fetch('data/co2-mlo.json');
  if (!r.ok) throw new Error(`co2 data HTTP ${r.status}`);
  return (await r.json()) as Co2Data;
}

/** What the record can honestly say about a year: a measurement, or why there is none. Nothing is interpolated or invented. */
export function co2AtYear(d: Co2Data, year: number): Co2Reading {
  const first = d.annual[0].year, last = d.annual[d.annual.length - 1].year;
  if (year < first) return { kind: 'none', reason: `No direct atmospheric measurements before ${first}. The ice-core record that reaches further back is not integrated yet.` };
  if (year > last) return { kind: 'none', reason: `The latest complete annual mean is ${last}.` };
  const row = d.annual.find((x) => x.year === year);
  return row ? { kind: 'observed', year, ppm: row.ppm, unc: row.unc } : { kind: 'none', reason: `The record has no annual mean for ${year}.` };
}

/** SVG line geometry for the annual series. x/y map a year / ppm to the plot box. */
export function chartGeometry(d: Co2Data, w: number, h: number, pad = 4) {
  const ys = d.annual.map((a) => a.ppm), y0 = Math.floor(Math.min(...ys) / 10) * 10, y1 = Math.ceil(Math.max(...ys) / 10) * 10;
  const x0 = d.annual[0].year, x1 = d.annual[d.annual.length - 1].year;
  const x = (year: number) => pad + ((year - x0) / (x1 - x0)) * (w - 2 * pad);
  const y = (ppm: number) => h - pad - ((ppm - y0) / (y1 - y0)) * (h - 2 * pad);
  const path = d.annual.map((a, i) => `${i ? 'L' : 'M'}${x(a.year).toFixed(1)} ${y(a.ppm).toFixed(1)}`).join(' ');
  return { path, x, y, yMin: y0, yMax: y1, xMin: x0, xMax: x1 };
}
