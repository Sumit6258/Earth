// Proxy-safe HTTP helpers.
// Node's built-in fetch ignores HTTP(S)_PROXY unless NODE_USE_ENV_PROXY=1, and cloud agent VMs route all
// egress through a proxy, so scripts shell out to curl (which honours the proxy env) instead of fetch().
import { spawnSync } from 'node:child_process';

const parseHeaders = (raw) => {
  const blocks = raw.split(/\r?\n\r?\n/).filter((b) => /^HTTP\//i.test(b.trim()));
  const last = blocks[blocks.length - 1] ?? '';
  const h = {};
  for (const line of last.split(/\r?\n/).slice(1)) {
    const i = line.indexOf(':');
    if (i > 0) h[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return h;
};

/** Small ranged GET that returns status, content-type, CORS and proxy-deny headers. */
export function curlProbe(url, { headers = {}, timeout = 10, range = '0-2047' } = {}) {
  const a = ['-sS', '-L', '--connect-timeout', '5', '-m', String(timeout), '-o', '/dev/null', '-D', '-',
    '-w', '\n@@%{http_code}|%{content_type}|%{size_download}'];
  if (range) a.push('-r', range);
  for (const [k, v] of Object.entries(headers)) a.push('-H', `${k}: ${v}`);
  a.push(url);
  const r = spawnSync('curl', a, { encoding: 'utf8', timeout: (timeout + 5) * 1000 });
  if (r.error) return { status: 0, error: `curl unavailable: ${r.error.code ?? r.error.message}` };
  const out = r.stdout ?? '';
  const m = /@@(\d+)\|([^|]*)\|(\d+)\s*$/.exec(out);
  const h = parseHeaders(out);
  return {
    status: m ? Number(m[1]) : 0,
    contentType: (m && m[2]) || h['content-type'] || '',
    bytes: m ? Number(m[3]) : 0,
    acao: h['access-control-allow-origin'] ?? null,
    deny: h['x-deny-reason'] ?? null,
    error: r.status === 0 ? null : ((r.stderr || '').trim().slice(0, 160) || `curl exit ${r.status}`),
  };
}

/** GET a (small) text resource. */
export function curlText(url, { timeout = 20, headers = {} } = {}) {
  const a = ['-sS', '-L', '--connect-timeout', '5', '-m', String(timeout), '-w', '\n@@%{http_code}'];
  for (const [k, v] of Object.entries(headers)) a.push('-H', `${k}: ${v}`);
  a.push(url);
  const r = spawnSync('curl', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: (timeout + 5) * 1000 });
  if (r.error) return { status: 0, text: '', error: `curl unavailable: ${r.error.code ?? r.error.message}` };
  const out = r.stdout ?? '';
  const m = /\n@@(\d+)$/.exec(out);
  return {
    status: m ? Number(m[1]) : 0,
    text: m ? out.slice(0, m.index) : '',
    error: r.status === 0 ? null : ((r.stderr || '').trim().slice(0, 160) || `curl exit ${r.status}`),
  };
}

/** Download a (large) file to disk. */
export function curlDownload(url, file, { timeout = 300 } = {}) {
  const r = spawnSync('curl', ['-sS', '-L', '--connect-timeout', '5', '-m', String(timeout), '-f', '-o', file, url],
    { encoding: 'utf8', timeout: (timeout + 10) * 1000 });
  return { ok: !r.error && r.status === 0, error: r.error ? String(r.error.message) : (r.stderr || '').trim().slice(0, 160) };
}
