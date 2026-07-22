// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { ViewContext } from '../viewContext';
import { STATE_ORDER, loadSeries, stateColour } from '../data';
import { columnChart, el } from '../components/charts';
import { glossaryTerm } from '../glossary';
import { formatMonth, formatNumber } from '../utils/format';

/** Policy milestones worth marking on a 25-year series. */
const MILESTONES: Array<{ month: string; text: string }> = [
  { month: '2008-07', text: 'Solar Homes rebate raised to $8,000 — the first boom begins' },
  { month: '2010-01', text: 'Small-scale Renewable Energy Scheme (SRES) starts' },
  { month: '2011-07', text: 'Generous state feed-in tariffs start closing to new customers' },
  { month: '2012-07', text: 'Carbon price starts; power bills jump and payback shortens' },
  { month: '2017-01', text: 'Retail electricity prices spike — a second wave of uptake' },
  { month: '2019-08', text: 'Victorian Solar Homes rebate opens' },
  { month: '2025-07', text: 'Cheaper Home Batteries rebate starts' },
];

export function renderTimeline(root: HTMLElement, ctx: ViewContext): void {
  const { meta } = ctx.data;
  let mode: 'month' | 'year' = (localStorage.getItem('tl.mode') as 'month' | 'year') || 'year';
  let stacked = localStorage.getItem('tl.stacked') !== '0';

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">Twenty-five years of rooftop solar</h1>
      <p class="view-sub">
        Every solar system installed in Australia since April 2001, month by month. The shape of this chart is
        policy: rebates open, feed-in tariffs close, power prices spike. ${formatNumber(meta.national.solar)}
        systems in total.
      </p>
    </div>
    <div class="controls">
      <div class="seg" role="group" data-role="mode">
        <button class="seg-btn" data-mode="year" aria-pressed="${mode === 'year'}">By year</button>
        <button class="seg-btn" data-mode="month" aria-pressed="${mode === 'month'}">By month</button>
      </div>
      <label class="checkbox"><input type="checkbox" data-role="stacked" ${stacked ? 'checked' : ''} /> Break down by state</label>
    </div>
    <div class="notice">
      <span>ℹ</span>
      <div>
        The last ${meta.solarProvisional} month(s) are hatched: ${glossaryTerm('stc', 'certificates')} can be lodged up to
        12 months after installation, so recent bars are incomplete and grow over time. A late dip is
        paperwork, not a crash. ${glossaryTerm('reporting-lag', 'More on this')}
      </div>
    </div>
    <div class="panel">
      <div class="panel-title" data-role="title"></div>
      <div class="panel-sub">Hover any bar for the count; hover a marker for what happened. Teal markers are policy milestones.</div>
      <div class="chart-scroll" data-role="chart"><div class="skeleton" style="height:380px"></div></div>
      <div class="legend" data-role="legend"></div>
    </div>
    <div class="panel" style="margin-top:var(--space-lg)">
      <div class="panel-title">What changed, and when</div>
      <div class="panel-sub">The policy decisions behind the peaks and troughs.</div>
      <ul data-role="milestones" style="padding-left:var(--space-lg);color:var(--text-secondary);font-size:var(--font-size-sm)"></ul>
    </div>
  `;

  (root.querySelector('[data-role="milestones"]') as HTMLElement).innerHTML = MILESTONES.map(
    (m) => `<li style="margin-bottom:6px"><strong style="font-family:var(--font-mono);color:var(--text-primary)">${formatMonth(m.month)}</strong> — ${m.text}</li>`,
  ).join('');

  const chartEl = root.querySelector('[data-role="chart"]') as HTMLElement;
  const titleEl = root.querySelector('[data-role="title"]') as HTMLElement;
  const legendEl = root.querySelector('[data-role="legend"]') as HTMLElement;

  loadSeries()
    .then((series) => {
      const draw = () => {
        chartEl.innerHTML = '';
        legendEl.innerHTML = '';
        titleEl.textContent = mode === 'year' ? 'Solar installs per year' : 'Solar installs per month';

        if (mode === 'month' && !stacked) {
          const provisionalFrom = series.solarMonths.length - meta.solarProvisional;
          chartEl.appendChild(
            columnChart(
              series.solarMonths.map((m, i) => ({
                id: m,
                label: formatMonth(m).replace(' ', ' ’').slice(0, 7),
                value: series.national.s[i],
                colour: '#f59e0b',
                hatched: i >= provisionalFrom,
                tip: `${formatMonth(m)}\n${formatNumber(series.national.s[i])} systems installed${i >= provisionalFrom ? '\n⚠ provisional' : ''}`,
              })),
              {
                width: 1400,
                height: 380,
                yLabel: 'Systems per month',
                valueFormat: (v) => formatNumber(v),
                annotations: MILESTONES.filter((ms) => series.solarMonths.includes(ms.month)).map((ms) => ({ atLabel: ms.month, text: `${formatMonth(ms.month)} — ${ms.text}` })),
              },
            ),
          );
          legendEl.innerHTML = plainLegend();
          return;
        }

        // Yearly aggregation (national or stacked by state).
        const years = [...new Set(series.solarMonths.map((m) => Number(m.slice(0, 4))))].sort();
        if (mode === 'year' && !stacked) {
          const byYear = new Map<number, number>();
          series.solarMonths.forEach((m, i) => {
            const y = Number(m.slice(0, 4));
            byYear.set(y, (byYear.get(y) || 0) + series.national.s[i]);
          });
          const lastYear = years[years.length - 1];
          chartEl.appendChild(
            columnChart(
              years.map((y) => ({
                id: String(y),
                label: String(y),
                value: byYear.get(y) || 0,
                colour: '#f59e0b',
                hatched: y === lastYear,
                tip: `${y}\n${formatNumber(byYear.get(y) || 0)} systems installed${y === lastYear ? '\n⚠ part-year and provisional' : ''}`,
              })),
              { width: 960, height: 380, labelEvery: 2, yLabel: 'Systems per year', valueFormat: (v) => formatNumber(v) },
            ),
          );
          legendEl.innerHTML = plainLegend();
          return;
        }

        // Stacked by state.
        drawStacked(series, mode, years);
      };

      const plainLegend = () =>
        `<span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:#f59e0b"></span>Solar systems</span>
         <span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:repeating-linear-gradient(45deg,#fde8c8,#fde8c8 2px,#d97706 2px,#d97706 4px)"></span>Provisional — still being reported</span>`;

      const drawStacked = (series: any, m: 'month' | 'year', years: number[]) => {
        const keys = m === 'year' ? years.map(String) : series.solarMonths;
        const width = m === 'year' ? 960 : 1400;
        const height = 380;
        const marg = { top: 18, right: 16, bottom: 46, left: 62 };
        const plotW = width - marg.left - marg.right;
        const plotH = height - marg.top - marg.bottom;

        // Build per-state totals per bucket.
        const buckets = keys.map(() => ({} as Record<string, number>));
        for (const st of STATE_ORDER) {
          const arr = series.states[st]?.solar ?? [];
          series.solarMonths.forEach((mo: string, i: number) => {
            const idx = m === 'year' ? years.indexOf(Number(mo.slice(0, 4))) : i;
            if (idx < 0) return;
            buckets[idx][st] = (buckets[idx][st] || 0) + (arr[i] || 0);
          });
        }
        const totals = buckets.map((b: Record<string, number>) =>
          Object.values(b).reduce((a: number, c: number) => a + c, 0),
        );
        const rawMax = Math.max(...totals, 1);
        const mag = 10 ** Math.floor(Math.log10(rawMax));
        const max = Math.ceil(rawMax / mag) * mag;

        const svg = el('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });
        svg.setAttribute('aria-label', 'Solar installs over time, stacked by state');

        for (let i = 0; i <= 4; i++) {
          const v = (max / 4) * i;
          const y = marg.top + plotH - (v / max) * plotH;
          svg.appendChild(el('line', { class: 'grid-line', x1: marg.left, y1: y, x2: marg.left + plotW, y2: y }));
          const t = el('text', { class: 'axis-label', x: marg.left - 8, y, 'text-anchor': 'end', 'dominant-baseline': 'middle' });
          t.textContent = formatNumber(v);
          svg.appendChild(t);
        }

        const slot = plotW / keys.length;
        const barW = Math.max(1, slot * 0.78);
        const labelEvery = m === 'year' ? 2 : Math.ceil(keys.length / 16);

        keys.forEach((k: string, i: number) => {
          const x = marg.left + i * slot + (slot - barW) / 2;
          let acc = 0;
          const label = m === 'year' ? k : formatMonth(k);
          for (const st of STATE_ORDER) {
            const v = buckets[i][st] || 0;
            if (v <= 0) continue;
            const h = (v / max) * plotH;
            const y = marg.top + plotH - (acc / max) * plotH - h;
            svg.appendChild(
              el('rect', {
                class: 'bar',
                x,
                y,
                width: barW,
                height: Math.max(0.4, h),
                fill: stateColour(st),
                'data-tip': `${label} · ${st}\n${formatNumber(v)} systems\n${((v / Math.max(1, totals[i])) * 100).toFixed(1)}% of that period`,
                'aria-label': `${label} ${st} ${v}`,
              }),
            );
            acc += v;
          }
          // Whole-column hover target for the total.
          svg.appendChild(
            el('rect', {
              x: marg.left + i * slot,
              y: marg.top,
              width: slot,
              height: plotH,
              fill: 'transparent',
              'data-tip': `${label}\n${formatNumber(totals[i])} systems nationally`,
            }),
          );
          if (i % labelEvery === 0) {
            const t = el('text', { class: 'axis-label', x: x + barW / 2, y: height - marg.bottom + 14, 'text-anchor': 'middle' });
            t.textContent = m === 'year' ? k : formatMonth(k).slice(0, 3) + ' ’' + k.slice(2, 4);
            svg.appendChild(t);
          }
        });

        svg.appendChild(el('line', { class: 'axis-line', x1: marg.left, y1: marg.top + plotH, x2: marg.left + plotW, y2: marg.top + plotH }));
        const yl = el('text', { class: 'axis-label', x: 14, y: marg.top + plotH / 2, transform: `rotate(-90 14 ${marg.top + plotH / 2})`, 'text-anchor': 'middle' });
        yl.textContent = m === 'year' ? 'Systems per year' : 'Systems per month';
        svg.appendChild(yl);

        chartEl.appendChild(svg);
        legendEl.innerHTML = STATE_ORDER.map(
          (s) => `<span class="legend-item" style="cursor:default"><span class="legend-swatch" style="background:${stateColour(s)}"></span>${s}</span>`,
        ).join('');
      };

      root.querySelector('[data-role="mode"]')?.addEventListener('click', (e) => {
        const btn = (e.target as Element).closest('[data-mode]');
        if (!btn) return;
        mode = btn.getAttribute('data-mode') as 'month' | 'year';
        localStorage.setItem('tl.mode', mode);
        root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode)));
        draw();
      });
      root.querySelector('[data-role="stacked"]')?.addEventListener('change', (e) => {
        stacked = (e.target as HTMLInputElement).checked;
        localStorage.setItem('tl.stacked', stacked ? '1' : '0');
        draw();
      });

      draw();
    })
    .catch(() => {
      chartEl.innerHTML = '<div class="error-box">Could not load the monthly series.</div>';
    });
}
