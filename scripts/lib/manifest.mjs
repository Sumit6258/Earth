import fs from 'node:fs';
import path from 'node:path';

export const MANIFEST = 'public/data/manifest.json';
export const readManifest = () => { try { return JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { return null; } };
export function writeManifest(m) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
}
/** Record WHY an optional layer is missing. The page and the CI summary both show this text, so failures are never silent. */
export function markUnavailable(key, reason) {
  console.warn(`${key}: unavailable (${reason})`);
  const m = readManifest();
  if (m) writeManifest({ ...m, unavailable: { ...(m.unavailable ?? {}), [key]: reason } });
}
export function clearUnavailable(m, key) {
  const u = { ...(m.unavailable ?? {}) };
  delete u[key];
  return { ...m, unavailable: u };
}
