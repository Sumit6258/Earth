// Pure parsers for NOAA GML's Mauna Loa CO2 CSV files. Comment lines start with '#'; missing values are flagged with -99.99 / -9.99.
const rows = (text) => text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
const num = (s) => (s === undefined || s.trim() === '' ? NaN : Number(s));

/** co2_annmean_mlo.csv: year, mean, unc */
export function parseAnnualCsv(text) {
  const out = [];
  for (const line of rows(text)) {
    const c = line.split(',').map((x) => x.trim());
    if (!/^\d{4}$/.test(c[0])) continue; // skips the header row
    const ppm = num(c[1]), unc = num(c[2]);
    if (ppm > 100 && ppm < 2000) out.push({ year: Number(c[0]), ppm, unc: Number.isFinite(unc) && unc >= 0 ? unc : null });
  }
  return out;
}

/** co2_mm_mlo.csv: year, month, decimal date, average, deseasonalized, ndays, sdev, unc */
export function parseMonthlyCsv(text) {
  const out = [];
  for (const line of rows(text)) {
    const c = line.split(',').map((x) => x.trim());
    if (!/^\d{4}$/.test(c[0])) continue;
    const ppm = num(c[3]);
    if (ppm > 100 && ppm < 2000) out.push({ year: Number(c[0]), month: Number(c[1]), ppm });
  }
  return out;
}
