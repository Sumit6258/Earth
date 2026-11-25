#!/usr/bin/env node
// Markdown summary of the M0 evidence: shown on the GitHub Actions run page and easy to paste back into the chat.
import fs from 'node:fs';
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const pf = read('docs/evidence/M0/preflight.json');
const gc = read('docs/evidence/M0/gibs-catalog.json');
const out = ['## EARTH M0 evidence'];
if (pf) {
  out.push(`**Preflight: ${pf.verdict}**${pf.failedRequired.length ? ` (failed: ${pf.failedRequired.join(', ')})` : ''} · ${pf.at}`);
  out.push('', '| check | level | status | detail |', '|---|---|---|---|');
  for (const r of pf.results) out.push(`| ${r.id} | ${r.level} | ${r.status} | ${String(r.detail).replace(/\|/g, '/').slice(0, 170)} |`);
  const v = pf.results.find((r) => r.id === 'npm.registry')?.data;
  if (v) out.push('', '**Latest registry versions:** ' + Object.entries(v).map(([k, x]) => `${k}@${x}`).join(', '));
} else out.push('_No preflight evidence was produced._');
if (gc) {
  for (const s of gc.snapshots) {
    out.push('', `### GIBS ${s.label}: ${s.layerCount} layers`, '', '| role | chosen | missing candidates |', '|---|---|---|');
    for (const [role, r] of Object.entries(s.roles)) out.push(`| ${role} | ${r.chosen ?? '**none**'} | ${r.missing.join(', ') || '—'} |`);
    for (const k of ['co2', 'night', 'seaIce', 'temperature']) out.push('', `discovered \`${k}\`: ${s.discovered[k].map((d) => d.id).slice(0, 8).join(', ') || 'none'}`);
    const t = Object.entries(s.tileMatrixSets).slice(0, 12).map(([k, m]) => `${k}: ${m.levels} levels, level 0 ${m.level0 ? `${m.level0.matrixWidth}×${m.level0.matrixHeight}${m.level0.degPerPixel ? ` @ ${m.level0.degPerPixel.toFixed(4)}°/px` : ''}` : '?'}`);
    out.push('', '**Tile matrix sets:** ' + t.join(' · '));
  }
} else out.push('', '_No GIBS catalog evidence was produced._');
const m1 = read('docs/evidence/results-M1.json');
if (m1) {
  const rows = new Map(), fails = [];
  const walk = (suite) => {
    for (const sp of suite.specs ?? []) for (const t of sp.tests ?? []) {
      const r = rows.get(sp.title) ?? {}; r[t.projectName] = t.status; rows.set(sp.title, r);
      if (t.status === 'unexpected' && fails.length < 8) fails.push(`${sp.title} [${t.projectName}]: ${String(t.results?.[0]?.error?.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n')[0].slice(0, 220)}`);
    }
    for (const c of suite.suites ?? []) walk(c);
  };
  for (const su of m1.suites ?? []) walk(su);
  const mark = (x) => (x === 'expected' ? '✅' : x === 'skipped' ? '⏭' : x ? '❌' : '—');
  out.push('', '### Acceptance M1 (informational)', '', '| test | desktop | mobile |', '|---|---|---|');
  for (const [title, r] of rows) out.push(`| ${title.replace(/\|/g, '/')} | ${mark(r.desktop)} | ${mark(r.mobile)} |`);
  if (fails.length) out.push('', '**First failures:**', '', '```', ...fails, '```');
}
const man = read('public/data/manifest.json');
if (man) {
  out.push('', '### Real data that made it into the build (from the manifest)', '', '| texture | layer | date | note |', '|---|---|---|---|');
  for (const t of man.textures.filter((x) => x.id.endsWith('_1k'))) out.push(`| ${t.id.replace('_1k', '')} | ${String(t.layer).slice(0, 90)} | ${t.date ?? ''} | ${t.coveragePercent !== undefined ? `cloud coverage ${t.coveragePercent}%` : `${t.tiles} tiles`} |`);
  const have = new Set(man.textures.map((x) => x.id.split('_').slice(0, 2).join('_')));
  for (const k of ['earth_day', 'earth_night', 'earth_clouds']) if (!have.has(k)) out.push(`| ${k} | **unavailable** | | ${String(man.unavailable?.[k.split('_')[1]] ?? 'no reason recorded').replace(/\|/g, '/').slice(0, 200)} |`);
  for (const d of man.datasets ?? []) out.push(`| dataset ${d.id} | ${d.source} | ${d.coverage} | ${d.units} |`);
  if (!(man.datasets ?? []).some((d) => d.id === 'co2-mlo')) out.push(`| dataset co2-mlo | **unavailable** | | ${String(man.unavailable?.co2 ?? 'no reason recorded').replace(/\|/g, '/').slice(0, 200)} |`);
} else out.push('', '_No texture manifest was produced (the texture step failed)._');
let tc = '';
try { tc = fs.readFileSync('docs/evidence/M0/typecheck.log', 'utf8'); } catch { /* no log */ }
const errs = tc.split('\n').filter((l) => /error TS/.test(l));
if (errs.length) out.push('', `### Type-check errors (${errs.length})`, '', '```', ...errs.slice(0, 40), '```');
console.log(out.join('\n'));
