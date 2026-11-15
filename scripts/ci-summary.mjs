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
console.log(out.join('\n'));
