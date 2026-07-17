import type { ViewContext } from '../viewContext';
import { loadSeries, stateColour } from '../data';
import { columnChart, horizontalBars } from '../components/charts';
import { aggregateByState, rankable } from '../analysis';
import { glossaryTerm } from '../glossary';
import { formatKwh, formatMonth, formatNumber } from '../utils/format';

/**
 * The Cheaper Home Batteries rebate as a natural experiment: zero to hundreds of
 * thousands in under a year. Separate from Timeline because this is an 11-month
 * policy step-change, not a 25-year arc.
 */
export function renderBatteries(root: HTMLElement, ctx: ViewContext): void {
  const { meta } = ctx.data;
  const monthsComplete = meta.battMonths.length - meta.battProvisional;
  const rated = rankable(ctx.data.postcodes).filter((p) => p.batPer100 != null);
  const totalKwh = ctx.data.postcodes.reduce((a, p) => a + p.kwh, 0);
  const avgKwh = meta.national.battery > 0 ? totalKwh / meta.national.battery : 0;

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">The battery boom</h1>
      <p class="view-sub">
        On 1 July 2025 the federal ${glossaryTerm('cheaper-batteries', 'Cheaper Home Batteries')} programme cut
        roughly 30% off the price of a ${glossaryTerm('battery', 'home battery')}. The scheme's records begin
        that same month — so this is a rare thing in public data: a policy switch flipped, measured from zero.
      </p>
    </div>
    <div class="stat-grid">
      <div class="stat">
        <div class="stat-label">Batteries installed</div>
        <div class="stat-value teal">${formatNumber(meta.national.battery)}</div>
        <div class="stat-note">since July 2025</div>
      </div>
      <div class="stat">
        <div class="stat-label">Storage added</div>
        <div class="stat-value">${formatKwh(totalKwh)}</div>
        <div class="stat-note">${avgKwh.toFixed(1)} kWh average</div>
      </div>
      <div class="stat">
        <div class="stat-label">Per 100 homes</div>
        <div class="stat-value">${meta.national.batPer100.toFixed(2)}</div>
        <div class="stat-note">nationally</div>
      </div>
      <div class="stat">
        <div class="stat-label">Monthly run rate</div>
        <div class="stat-value">${formatNumber(Math.round(meta.national.battery / Math.max(1, monthsComplete)))}</div>
        <div class="stat-note">complete months only</div>
      </div>
    </div>
    <div class="notice">
      <span>ℹ</span>
      <div>
        The most recent ${meta.battProvisional} month(s) are drawn hatched — installers have up to 12 months to
        lodge certificates, so the newest bars are incomplete and will grow.
        ${glossaryTerm('reporting-lag', 'Why recent months look low')}
      </div>
    </div>
    <div class="panel" style="margin-bottom:var(--space-lg)">
      <div class="panel-title">Batteries installed each month</div>
      <div class="panel-sub">From a standing start. Every bar is a month; hover for the exact count.</div>
      <div class="chart-scroll" data-role="trend"><div class="skeleton" style="height:320px"></div></div>
    </div>
    <div class="panel" style="margin-bottom:var(--space-lg)">
      <div class="panel-title">Which states are adopting fastest</div>
      <div class="panel-sub">Batteries per 100 homes. Batteries follow solar — you need panels to have something to store.</div>
      <div class="chart-scroll" data-role="states"></div>
    </div>
    <div class="panel">
      <div class="panel-title">Top 25 postcodes for battery uptake</div>
      <div class="panel-sub">Batteries per 100 homes, postcodes with 200+ homes. Click any bar to open the postcode.</div>
      <div class="chart-scroll" data-role="top"></div>
    </div>
  `;

  // Per-state.
  const aggs = aggregateByState(ctx.data.postcodes).slice().sort((a, b) => b.batPer100 - a.batPer100);
  (root.querySelector('[data-role="states"]') as HTMLElement).appendChild(
    horizontalBars(
      aggs.map((a) => ({
        id: a.state,
        label: a.state,
        value: a.batPer100,
        colour: stateColour(a.state),
        tip: `${a.state}\n${a.batPer100.toFixed(2)} batteries per 100 homes\n${formatNumber(a.battery)} batteries · ${formatNumber(a.dwellings)} homes`,
      })),
      { width: 880, rowHeight: 30, labelWidth: 60, valueFormat: (v) => v.toFixed(2) },
    ),
  );

  // Top postcodes.
  const top = rated.slice().sort((a, b) => (b.batPer100 as number) - (a.batPer100 as number)).slice(0, 25);
  (root.querySelector('[data-role="top"]') as HTMLElement).appendChild(
    horizontalBars(
      top.map((p, i) => ({
        id: p.pc,
        label: `${i + 1}. ${p.pc} ${p.loc || ''}`.trim(),
        value: p.batPer100 as number,
        colour: '#0f766e',
        tip:
          `${p.pc}${p.loc ? ` · ${p.loc}` : ''} (${p.st})\n` +
          `${(p.batPer100 as number).toFixed(2)} batteries per 100 homes\n` +
          `${formatNumber(p.bat)} batteries · ${formatKwh(p.kwh)}\n${formatNumber(p.dw)} homes`,
      })),
      { width: 900, rowHeight: 27, labelWidth: 210, valueFormat: (v) => v.toFixed(2), onClick: (id) => ctx.openPostcode(id) },
    ),
  );

  // Monthly national trend (needs series.json).
  const trendEl = root.querySelector('[data-role="trend"]') as HTMLElement;
  loadSeries()
    .then((series) => {
      trendEl.innerHTML = '';
      const chart = columnChart(
        series.battMonths.map((m, i) => {
          const provisional = i >= series.battMonths.length - meta.battProvisional;
          return {
            id: m,
            label: formatMonth(m),
            value: series.national.b[i],
            colour: '#0f766e',
            hatched: provisional,
            tip:
              `${formatMonth(m)}\n${formatNumber(series.national.b[i])} batteries installed` +
              (provisional ? '\n⚠ provisional — certificates still being lodged' : ''),
          };
        }),
        {
          width: 960,
          height: 340,
          labelEvery: 1,
          yLabel: 'Batteries per month',
          valueFormat: (v) => formatNumber(v),
          annotations: [{ atLabel: series.battMonths[0], text: 'Cheaper Home Batteries rebate starts, 1 July 2025', colour: '#b45309' }],
        },
      );
      trendEl.appendChild(chart);

      const legend = document.createElement('div');
      legend.className = 'legend';
      legend.innerHTML = `
        <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#0f766e"></span>Batteries installed</span>
        <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:repeating-linear-gradient(45deg,#fde8c8,#fde8c8 2px,#d97706 2px,#d97706 4px)"></span>Provisional — still being reported</span>
      `;
      trendEl.appendChild(legend);
    })
    .catch(() => {
      trendEl.innerHTML = '<div class="error-box">Could not load the monthly battery series.</div>';
    });
}
