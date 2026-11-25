import { loadCo2, co2AtYear, chartGeometry, type Co2Data } from '../data/co2';

export interface ManifestLike { datasets?: { id: string }[]; unavailable?: Record<string, string> }
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/** First real data layer: the NOAA Mauna Loa CO2 record, with units, source and honest limits. */
export async function initCo2(mf: ManifestLike) {
  $('#co2').hidden = false;
  const state = $('#co2-state'), body = $('#co2-body');
  const fail = (why: string) => { state.hidden = false; state.textContent = `Temporarily unavailable (${why}).`; };
  if (!mf.datasets?.some((d) => d.id === 'co2-mlo')) return fail(mf.unavailable?.co2 ?? 'not built');
  let data: Co2Data;
  try { data = await loadCo2(); } catch (e) { return fail(e instanceof Error ? e.message : String(e)); }
  body.hidden = false;
  const g = chartGeometry(data, 300, 80), dot = document.querySelector('#co2-dot')!;
  document.querySelector('#co2-line')!.setAttribute('d', g.path);
  const slider = $<HTMLInputElement>('#co2-year'), last = data.annual[data.annual.length - 1].year;
  slider.min = '1900'; slider.max = String(last); slider.value = String(last);
  const render = () => {
    const y = Number(slider.value), r = co2AtYear(data, y);
    $('#co2-yr').textContent = String(y);
    $('#co2-kind').hidden = r.kind !== 'observed';
    $('#co2-note').hidden = r.kind === 'observed';
    if (r.kind === 'observed') {
      $('#co2-val').textContent = `${r.ppm.toFixed(2)} ppm${r.unc !== null ? ` ±${r.unc.toFixed(2)}` : ''}`;
      dot.setAttribute('cx', g.x(y).toFixed(1)); dot.setAttribute('cy', g.y(r.ppm).toFixed(1)); dot.setAttribute('visibility', 'visible');
    } else {
      $('#co2-val').textContent = 'no measurement';
      $('#co2-note').textContent = r.reason;
      dot.setAttribute('visibility', 'hidden');
    }
  };
  slider.addEventListener('input', render);
  render();
}
