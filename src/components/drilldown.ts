import type { Dataset } from '../data';
import { isGrowthCorridor, stateColour } from '../data';
import { loadSeries } from '../data';
import type { Postcode } from '../types';
import { columnChart } from './charts';
import { glossaryTerm } from '../glossary';
import { escapeHtml, formatKw, formatKwh, formatMonth, formatNumber, formatPer100, formatPercent } from '../utils/format';
import { median, rankedByPer100 } from '../analysis';

/**
 * Per-postcode drill-down drawer. Every clickable postcode anywhere in the site
 * lands here, and it is hash-linkable (#postcode=3000).
 */
export function createDrilldown(data: Dataset): { open: (pc: string) => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.innerHTML = '<div class="drawer-head"></div><div class="drawer-body"></div>';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '✕';
  drawer.appendChild(closeBtn);

  document.body.append(overlay, drawer);

  const ranked = rankedByPer100(data.postcodes);
  const nationalMedian = median(ranked.map((p) => p.per100 as number));

  const close = () => {
    overlay.classList.remove('open');
    drawer.classList.remove('open');
    if (location.hash.startsWith('#postcode=')) {
      history.replaceState(null, '', location.pathname + location.search);
    }
  };

  const open = (pc: string) => {
    const p = data.byPostcode.get(pc);
    if (!p) return;
    render(p);
    overlay.classList.add('open');
    drawer.classList.add('open');
    drawer.scrollTop = 0;
    closeBtn.focus();
    history.replaceState(null, '', `#postcode=${pc}`);
  };

  function render(p: Postcode) {
    const head = drawer.querySelector('.drawer-head') as HTMLElement;
    const body = drawer.querySelector('.drawer-body') as HTMLElement;

    const rank = ranked.findIndex((x) => x.pc === p.pc);
    const stateRanked = ranked.filter((x) => x.st === p.st);
    const stateRank = stateRanked.findIndex((x) => x.pc === p.pc);
    const stateMedian = median(stateRanked.map((x) => x.per100 as number));

    head.innerHTML = `
      <div class="drawer-title">${escapeHtml(p.pc)}</div>
      <div class="drawer-sub">
        ${p.locs.length ? escapeHtml(p.locs.slice(0, 4).join(', ')) : 'No locality on record'}
        ${p.locs.length > 4 ? ` +${p.locs.length - 4} more` : ''}
        ${p.st ? ` · <span class="pill" style="background:${stateColour(p.st)}">${escapeHtml(p.st)}</span>` : ''}
      </div>
      ${p.lga ? `<div class="drawer-sub">${escapeHtml(p.lga)}${p.sa4 ? ` · ${escapeHtml(p.sa4)}` : ''}</div>` : ''}
    `;

    const growth = isGrowthCorridor(p);
    const parts: string[] = [];

    parts.push(`
      <div class="drawer-section">
        <div class="kv-grid">
          <div class="kv">
            <div class="kv-label">Solar systems</div>
            <div class="kv-value" style="color:var(--accent-primary-hover)">${formatNumber(p.solar)}</div>
          </div>
          <div class="kv">
            <div class="kv-label">Per 100 homes</div>
            <div class="kv-value">${formatPer100(p.per100)}</div>
          </div>
          <div class="kv">
            <div class="kv-label">Total capacity</div>
            <div class="kv-value">${formatKw(p.kw)}</div>
          </div>
          <div class="kv">
            <div class="kv-label">Batteries</div>
            <div class="kv-value" style="color:var(--accent-secondary)">${formatNumber(p.bat)}</div>
          </div>
          <div class="kv">
            <div class="kv-label">Battery storage</div>
            <div class="kv-value">${formatKwh(p.kwh)}</div>
          </div>
          <div class="kv">
            <div class="kv-label">Avg system size</div>
            <div class="kv-value">${p.avgKw != null ? `${p.avgKw.toFixed(1)} kW` : '—'}</div>
          </div>
        </div>
        ${
          growth
            ? `<div class="notice" style="margin-top:var(--space-md)"><span>⚠</span><div>
                 <strong>More systems than 2021 homes.</strong> Either houses have been built here since the
                 Census, or farm and business rooftops are carrying systems no household lives under. Uptake here
                 is genuinely high, but the per-100 figure overshoots.
                 ${glossaryTerm('growth-corridor', 'What this means')}
               </div></div>`
            : ''
        }
      </div>
    `);

    if (p.per100 != null) {
      const maxCompare = Math.max(p.per100, stateMedian, nationalMedian) * 1.1 || 1;
      const row = (label: string, v: number, colour: string) => `
        <div class="compare-row">
          <div class="compare-label">${escapeHtml(label)}</div>
          <div class="compare-track"><div class="compare-fill" style="width:${Math.min(100, (v / maxCompare) * 100).toFixed(1)}%;background:${colour}"></div></div>
          <div class="compare-val">${formatPer100(v)}</div>
        </div>`;
      parts.push(`
        <div class="drawer-section">
          <h3>How it compares — systems per 100 homes</h3>
          ${row(p.pc, p.per100, 'var(--accent-primary)')}
          ${p.st ? row(`${p.st} median`, stateMedian, '#cbb894') : ''}
          ${row('National median', nationalMedian, '#cbb894')}
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-sm)">
            Ranked <strong>#${rank + 1}</strong> of ${formatNumber(ranked.length)} postcodes nationally${
              p.st && stateRank >= 0 ? `, <strong>#${stateRank + 1}</strong> of ${formatNumber(stateRanked.length)} in ${escapeHtml(p.st)}` : ''
            }.
          </p>
        </div>
      `);
    }

    // Why: tenure + dwelling structure.
    if (p.dw > 0) {
      const seg = (v: number, colour: string, label: string) =>
        v > 0
          ? `<div class="mini-bar-seg" style="flex:${v};background:${colour}" data-tip="${escapeHtml(`${label}: ${formatNumber(v)} homes (${((v / p.dw) * 100).toFixed(1)}%)`)}"></div>`
          : '';
      const other = Math.max(0, p.dw - p.ownOut - p.ownMtg - p.rented);
      const othDwell = Math.max(0, p.dw - p.sepHouse - p.flatCount);
      parts.push(`
        <div class="drawer-section">
          <h3>Why — who lives here (Census 2021)</h3>
          <p style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-bottom:var(--space-sm)">
            ${formatNumber(p.dw)} ${glossaryTerm('dwellings', 'occupied homes')}.
            ${formatPercent(p.ownerSepShare)} are ${glossaryTerm('owner-detached', 'owner-occupied detached houses')} —
            the homes that can most easily install solar.
          </p>
          <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-bottom:3px">Tenure</div>
          <div class="mini-bar" style="margin-bottom:var(--space-md)">
            ${seg(p.ownOut, '#15803d', 'Owned outright')}
            ${seg(p.ownMtg, '#65a30d', 'Owned with a mortgage')}
            ${seg(p.rented, '#dc2626', 'Rented')}
            ${seg(other, '#cbd5e1', 'Other / not stated')}
          </div>
          <div style="font-size:var(--font-size-xs);color:var(--text-tertiary);margin-bottom:3px">Dwelling type</div>
          <div class="mini-bar">
            ${seg(p.sepHouse, '#f59e0b', 'Separate houses')}
            ${seg(p.flatCount, '#6366f1', 'Flats / apartments')}
            ${seg(othDwell, '#94a3b8', 'Townhouses / other')}
          </div>
          <div class="legend">
            <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#15803d"></span>Owned outright ${formatPercent((p.ownOut / p.dw) * 100, 0)}</span>
            <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#65a30d"></span>Mortgage ${formatPercent((p.ownMtg / p.dw) * 100, 0)}</span>
            <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#dc2626"></span>Rented ${formatPercent(p.rentShare, 0)}</span>
            <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#6366f1"></span>Apartments ${formatPercent(p.flatShare, 0)}</span>
          </div>
        </div>
      `);
    }

    parts.push('<div class="drawer-section" data-role="history"><h3>Installs over time</h3><div class="skeleton" style="height:180px"></div></div>');
    body.innerHTML = parts.join('');

    // Monthly history is lazy — series.json is ~2 MB.
    const histSlot = body.querySelector('[data-role="history"]') as HTMLElement;
    loadSeries()
      .then((series) => {
        if (!drawer.classList.contains('open')) return;
        const rec = series.postcodes[p.pc];
        if (!rec) {
          histSlot.innerHTML = '<h3>Installs over time</h3><div class="empty">No monthly history for this postcode.</div>';
          return;
        }
        // Roll monthly up to years for a readable drawer-width chart.
        const byYear = new Map<number, number>();
        series.solarMonths.forEach((m, i) => {
          const y = Number(m.slice(0, 4));
          byYear.set(y, (byYear.get(y) || 0) + rec.s[i]);
        });
        const yearData = [...byYear.entries()].sort((a, b) => a[0] - b[0]);
        const chart = columnChart(
          yearData.map(([y, v]) => ({
            id: String(y),
            label: `'${String(y).slice(2)}`,
            value: v,
            colour: '#f59e0b',
            tip: `${y}: ${formatNumber(v)} solar installs in ${p.pc}`,
          })),
          { width: 420, height: 180, labelEvery: 3, valueFormat: (v) => formatNumber(v) },
        );
        histSlot.innerHTML = '<h3>Solar installs by year</h3>';
        const frame = document.createElement('div');
        frame.className = 'chart-scroll';
        frame.appendChild(chart);
        histSlot.appendChild(frame);

        const battTotal = rec.b.reduce((a, b) => a + b, 0);
        if (battTotal > 0) {
          const bChart = columnChart(
            series.battMonths.map((m, i) => ({
              id: m,
              label: formatMonth(m).slice(0, 3),
              value: rec.b[i],
              colour: '#0f766e',
              tip: `${formatMonth(m)}: ${formatNumber(rec.b[i])} batteries in ${p.pc}`,
              hatched: i >= series.battMonths.length - data.meta.battProvisional,
            })),
            { width: 420, height: 150, labelEvery: 2, valueFormat: (v) => formatNumber(v) },
          );
          const h = document.createElement('h3');
          h.textContent = 'Batteries by month';
          h.style.marginTop = 'var(--space-lg)';
          histSlot.appendChild(h);
          const bFrame = document.createElement('div');
          bFrame.className = 'chart-scroll';
          bFrame.appendChild(bChart);
          histSlot.appendChild(bFrame);
        }
      })
      .catch(() => {
        histSlot.innerHTML = '<h3>Installs over time</h3><div class="empty">Could not load monthly history.</div>';
      });
  }

  overlay.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });

  return { open, close };
}
