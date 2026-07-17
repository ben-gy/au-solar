import type { ViewContext } from '../viewContext';
import { STATE_ORDER, isGrowthCorridor, stateColour } from '../data';
import { horizontalBars } from '../components/charts';
import { aggregateByState, rankable } from '../analysis';
import { glossaryTerm } from '../glossary';
import { formatKw, formatNumber, formatPer100 } from '../utils/format';

type Metric = 'per100' | 'batPer100' | 'solar' | 'kw' | 'avgKw';

const METRICS: Record<Metric, { label: string; fmt: (v: number) => string; unit: string }> = {
  per100: { label: 'Solar per 100 homes', fmt: (v) => v.toFixed(1), unit: 'systems per 100 homes' },
  batPer100: { label: 'Batteries per 100 homes', fmt: (v) => v.toFixed(2), unit: 'batteries per 100 homes' },
  solar: { label: 'Total systems', fmt: (v) => formatNumber(v), unit: 'systems' },
  kw: { label: 'Total capacity', fmt: (v) => formatKw(v), unit: 'kW installed' },
  avgKw: { label: 'Average system size', fmt: (v) => `${v.toFixed(1)} kW`, unit: 'kW average' },
};

export function renderRankings(root: HTMLElement, ctx: ViewContext): void {
  let metric: Metric = (localStorage.getItem('rank.metric') as Metric) || 'per100';
  let state = localStorage.getItem('rank.state') || 'ALL';
  let hideGrowth = localStorage.getItem('rank.hideGrowth') === '1';
  let order = (localStorage.getItem('rank.order') as 'top' | 'bottom') || 'top';

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">Rankings</h1>
      <p class="view-sub">
        Australia's most and least solar postcodes. Ranked ${glossaryTerm('per-100', 'per 100 homes')} by default —
        raw totals just rank postcodes by size. Only postcodes with 200+ homes are ranked, so a hamlet
        with nine houses can't top the chart on noise.
      </p>
    </div>
    <div class="controls">
      <span class="field-label">Rank by</span>
      <div class="seg" role="group" data-role="metric">
        ${(Object.keys(METRICS) as Metric[])
          .map((m) => `<button class="seg-btn" data-metric="${m}" aria-pressed="${m === metric}">${METRICS[m].label}</button>`)
          .join('')}
      </div>
      <div class="seg" role="group" data-role="order">
        <button class="seg-btn" data-order="top" aria-pressed="${order === 'top'}">Highest</button>
        <button class="seg-btn" data-order="bottom" aria-pressed="${order === 'bottom'}">Lowest</button>
      </div>
      <span class="field-label">State</span>
      <select data-role="state">
        <option value="ALL">All of Australia</option>
        ${STATE_ORDER.map((s) => `<option value="${s}" ${s === state ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <label class="checkbox">
        <input type="checkbox" data-role="growth" ${hideGrowth ? 'checked' : ''} />
        Hide ratios above 100
      </label>
    </div>
    <div class="panel" style="margin-bottom:var(--space-lg)">
      <div class="panel-title">States and territories</div>
      <div class="panel-sub" data-role="state-sub"></div>
      <div class="chart-scroll" data-role="states"></div>
    </div>
    <div class="panel">
      <div class="panel-title" data-role="title"></div>
      <div class="panel-sub" data-role="sub"></div>
      <div class="chart-scroll" data-role="chart"></div>
    </div>
  `;

  const chartEl = root.querySelector('[data-role="chart"]') as HTMLElement;
  const statesEl = root.querySelector('[data-role="states"]') as HTMLElement;
  const stateSubEl = root.querySelector('[data-role="state-sub"]') as HTMLElement;
  const titleEl = root.querySelector('[data-role="title"]') as HTMLElement;
  const subEl = root.querySelector('[data-role="sub"]') as HTMLElement;

  const drawStates = () => {
    const aggs = aggregateByState(ctx.data.postcodes);
    const key = metric === 'batPer100' ? 'batPer100' : 'per100';
    const sorted = aggs.slice().sort((a, b) => (b as any)[key] - (a as any)[key]);
    // Derive the leader/trailer from the data — never hardcode prose that a
    // pipeline run could quietly turn into a lie.
    const lead = sorted[0];
    const trail = sorted[sorted.length - 1];
    const unit = key === 'batPer100' ? 'Home batteries' : 'Solar systems';
    const dp = key === 'batPer100' ? 2 : 1;
    stateSubEl.textContent =
      `${unit} per 100 homes, by state. ${lead.state} leads on ${(lead as any)[key].toFixed(dp)}; ` +
      `${trail.state} trails on ${(trail as any)[key].toFixed(dp)}` +
      (key === 'batPer100' ? '. Battery uptake tracks where solar already is.' : '.');
    statesEl.innerHTML = '';
    statesEl.appendChild(
      horizontalBars(
        sorted.map((a) => ({
          id: a.state,
          label: a.state,
          value: (a as any)[key],
          colour: stateColour(a.state),
          tip:
            `${a.state}\n${(a as any)[key].toFixed(2)} ${key === 'batPer100' ? 'batteries' : 'systems'} per 100 homes\n` +
            `${formatNumber(a.solar)} systems · ${formatNumber(a.battery)} batteries\n${formatNumber(a.dwellings)} homes · ${formatKw(a.kw)}`,
        })),
        { width: 880, rowHeight: 30, labelWidth: 60, valueFormat: (v) => v.toFixed(key === 'batPer100' ? 2 : 1) },
      ),
    );
  };

  const draw = () => {
    const cfg = METRICS[metric];
    let pool = rankable(ctx.data.postcodes);
    if (state !== 'ALL') pool = pool.filter((p) => p.st === state);
    if (hideGrowth) pool = pool.filter((p) => !isGrowthCorridor(p));
    pool = pool.filter((p) => (p[metric] as number | null) != null);
    if (metric === 'avgKw') pool = pool.filter((p) => p.solar >= 200);

    const sorted = pool.slice().sort((a, b) => (b[metric] as number) - (a[metric] as number));
    const rows = (order === 'top' ? sorted.slice(0, 30) : sorted.slice(-30).reverse());

    titleEl.textContent = `${order === 'top' ? 'Highest' : 'Lowest'} 30 postcodes — ${cfg.label.toLowerCase()}`;
    subEl.textContent =
      `${formatNumber(pool.length)} postcodes ranked${state !== 'ALL' ? ` in ${state}` : ''}` +
      `${hideGrowth ? ', ratios above 100 hidden' : ''}. Click any bar to open the postcode.`;

    chartEl.innerHTML = '';
    if (rows.length === 0) {
      chartEl.innerHTML = '<div class="empty">No postcodes match these filters.</div>';
      return;
    }
    chartEl.appendChild(
      horizontalBars(
        rows.map((p, i) => ({
          id: p.pc,
          label: `${order === 'top' ? i + 1 : pool.length - i}. ${p.pc} ${p.loc || ''}`.trim(),
          value: p[metric] as number,
          colour: stateColour(p.st),
          flag: isGrowthCorridor(p) ? '⚠' : undefined,
          tip:
            `${p.pc}${p.loc ? ` · ${p.loc}` : ''} (${p.st})\n` +
            `${cfg.fmt(p[metric] as number)} ${cfg.unit}\n` +
            `${formatPer100(p.per100)} solar per 100 homes · ${formatNumber(p.solar)} systems\n` +
            `${formatNumber(p.bat)} batteries · ${formatNumber(p.dw)} homes` +
            (isGrowthCorridor(p) ? '\n⚠ more systems than 2021 homes — ratio overshoots' : ''),
        })),
        { width: 900, rowHeight: 27, labelWidth: 210, valueFormat: cfg.fmt, onClick: (id) => ctx.openPostcode(id) },
      ),
    );
  };

  root.querySelector('[data-role="metric"]')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-metric]');
    if (!btn) return;
    metric = btn.getAttribute('data-metric') as Metric;
    localStorage.setItem('rank.metric', metric);
    root.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-metric') === metric)));
    drawStates();
    draw();
  });
  root.querySelector('[data-role="order"]')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-order]');
    if (!btn) return;
    order = btn.getAttribute('data-order') as 'top' | 'bottom';
    localStorage.setItem('rank.order', order);
    root.querySelectorAll('[data-order]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-order') === order)));
    draw();
  });
  root.querySelector('[data-role="state"]')?.addEventListener('change', (e) => {
    state = (e.target as HTMLSelectElement).value;
    localStorage.setItem('rank.state', state);
    draw();
  });
  root.querySelector('[data-role="growth"]')?.addEventListener('change', (e) => {
    hideGrowth = (e.target as HTMLInputElement).checked;
    localStorage.setItem('rank.hideGrowth', hideGrowth ? '1' : '0');
    draw();
  });

  drawStates();
  draw();
}
