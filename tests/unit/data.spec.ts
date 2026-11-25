import { test, expect } from '@playwright/test';
import { parseAnnualCsv, parseMonthlyCsv } from '../../scripts/data/co2-parse.mjs';
import { co2AtYear, chartGeometry, type Co2Data } from '../../src/data/co2';

const ANNUAL = `# --------------------------------------------------------------------
# USE OF NOAA GML DATA
# (comment lines start with #)
# --------------------------------------------------------------------
year,mean,unc
1959,315.98,0.12
1960,316.91,0.12
1961,317.64,-9.99
1962,-99.99,-9.99
2024,424.61,0.10
`;
const MONTHLY = `# header comment
year,month,decimal date,average,deseasonalized,ndays,sdev,unc
2025,5,2025.3750,430.51,429.62,27,0.35,0.14
2025,6,2025.4583,-99.99,-99.99,0,-9.99,-9.99
2025,7,2025.5417,427.88,429.01,28,0.31,0.13
`;
const data: Co2Data = { station: { name: 's', lat: 0, lon: 0, elevationM: 0 }, annual: parseAnnualCsv(ANNUAL), latestMonthly: null, source: { name: 'n', url: 'u', citation: 'c', license: 'l' }, units: 'ppm', retrievedAt: 'x' };

test('U-09 NOAA CSV parsers skip comments, headers and missing-value flags @M3', () => {
  expect(parseAnnualCsv(ANNUAL)).toEqual([{ year: 1959, ppm: 315.98, unc: 0.12 }, { year: 1960, ppm: 316.91, unc: 0.12 }, { year: 1961, ppm: 317.64, unc: null }, { year: 2024, ppm: 424.61, unc: 0.1 }]);
  expect(parseMonthlyCsv(MONTHLY)).toEqual([{ year: 2025, month: 5, ppm: 430.51 }, { year: 2025, month: 7, ppm: 427.88 }]);
  expect(parseAnnualCsv('')).toEqual([]);
  expect(parseAnnualCsv('<html>not csv</html>')).toEqual([]);
});

test('U-10 the CO2 record answers only what it measured and says why otherwise @M3', () => {
  expect(co2AtYear(data, 1960)).toEqual({ kind: 'observed', year: 1960, ppm: 316.91, unc: 0.12 });
  const before = co2AtYear(data, 1900);
  expect(before.kind).toBe('none');
  expect(before.kind === 'none' && before.reason).toMatch(/before 1959/);
  expect(co2AtYear(data, 2030).kind).toBe('none');
  expect(co2AtYear(data, 1962).kind).toBe('none'); // a year the file does not have: no interpolation
  const g = chartGeometry(data, 300, 80);
  expect(g.xMin).toBe(1959); expect(g.xMax).toBe(2024);
  expect(g.x(1959)).toBeCloseTo(4, 6); expect(g.x(2024)).toBeCloseTo(296, 6);
  expect(g.y(g.yMin)).toBeCloseTo(76, 6); expect(g.y(g.yMax)).toBeCloseTo(4, 6);
  expect(g.y(424.61)).toBeLessThan(g.y(315.98));       // higher CO2 is higher on the chart
  expect(g.path.startsWith('M')).toBe(true);
});
