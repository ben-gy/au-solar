import type { ViewContext } from '../viewContext';
import { columnChart } from '../components/charts';
import { histogram, median, quantile, rankable } from '../analysis';
import { formatNumber } from '../utils/format';

/**
 * How unequal is uptake? Averages hide the long low tail of renter- and
 * apartment-heavy postcodes; a histogram makes it impossible to miss.
 */
export function renderDistribution(root: HTMLElement, ctx: ViewContext): void {
  let metric: 'per100' | 'batPer100' | 'avgKw' = 'per100';

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">Distribution</h1>
      <p class="view-sub">
        A national average of ${ctx.data.meta.national.per100.toFixed(1)} systems per 100 homes hides an enormous
        spread. Each bar counts the postcodes in that range — click one to filter down to those postcodes.
      </p>
    </div>
    <div class="controls">
      <span class="field-label">Show</span>
      <div class="seg" role="group" data-role="metric">
        <button class="seg-btn" data-metric="per100" aria-pressed="true">Solar per 100 homes</button>
        <button class="seg-btn" data-metric="batPer100" aria-pressed="false">Batteries per 100 homes</button>
        <button class="seg-btn" data-metric="avgKw" aria-pressed="false">Average system size</button>
      </div>
    </div>
    <div class="stat-grid" data-role="stats"></div>
    <div class="panel">
      <div class="panel-title" data-role="title"></div>
      <div class="panel-sub" data-role="sub"></div>
      <div class="chart-scroll" data-role="chart"></div>
    </div>
    <div class="panel" style="margin-top:var(--space-lg);display:none" data-role="bucket">
      <div class="panel-title" data-role="bucket-title"></div>
      <div class="panel-sub">Click any postcode to open it.</div>
      <div data-role="bucket-list" style="display:flex;flex-wrap:wrap;gap:var(--space-xs)"></div>
    </div>
  `;

  const chartEl = root.querySelector('[data-role="chart"]') as HTMLElement;
  const statsEl = root.querySelector('[data-role="stats"]') as HTMLElement;
  const titleEl = root.querySelector('[data-role="title"]') as HTMLElement;
  const subEl = root.querySelector('[data-role="sub"]') as HTMLElement;
  const bucketEl = root.querySelector('[data-role="bucket"]') as HTMLElement;
  const bucketTitle = root.querySelector('[data-role="bucket-title"]') as HTMLElement;
  const bucketList = root.querySelector('[data-role="bucket-list"]') as HTMLElement;

  const CFG = {
    per100: { label: 'solar systems per 100 homes', max: 120, bins: 24, colour: '#f59e0b', dp: 0 },
    batPer100: { label: 'batteries per 100 homes', max: 12, bins: 24, colour: '#0f766e', dp: 1 },
    avgKw: { label: 'average system size (kW)', max: 12, bins: 24, colour: '#6366f1', dp: 1 },
  } as const;

  const draw = () => {
    const cfg = CFG[metric];
    let pool = rankable(ctx.data.postcodes).filter((p) => p[metric] != null);
    if (metric === 'avgKw') pool = pool.filter((p) => p.solar >= 200);

    const values = pool.map((p) => p[metric] as number);
    const med = median(values);
    const p10 = quantile(values, 0.1);
    const p90 = quantile(values, 0.9);

    titleEl.textContent = `How postcodes are spread — ${cfg.label}`;
    subEl.textContent = `${formatNumber(pool.length)} postcodes with 200+ homes. The tallest bars are where most of Australia sits.`;

    statsEl.innerHTML = `
      <div class="stat"><div class="stat-label">Median postcode</div><div class="stat-value amber">${med.toFixed(cfg.dp === 0 ? 1 : 2)}</div><div class="stat-note">${cfg.label}</div></div>
      <div class="stat"><div class="stat-label">Bottom 10%</div><div class="stat-value">${p10.toFixed(cfg.dp === 0 ? 1 : 2)}</div><div class="stat-note">below this line</div></div>
      <div class="stat"><div class="stat-label">Top 10%</div><div class="stat-value">${p90.toFixed(cfg.dp === 0 ? 1 : 2)}</div><div class="stat-note">above this line</div></div>
      <div class="stat"><div class="stat-label">Top vs bottom decile</div><div class="stat-value">${p10 > 0 ? `${(p90 / p10).toFixed(1)}×` : '—'}</div><div class="stat-note">gap between them</div></div>
    `;

    const bins = histogram(pool, (p) => p[metric] as number | null, cfg.bins, cfg.max);
    chartEl.innerHTML = '';
    chartEl.appendChild(
      columnChart(
        bins.map((b, i) => ({
          id: String(i),
          label: b.from.toFixed(cfg.dp),
          value: b.count,
          colour: cfg.colour,
          tip:
            `${b.from.toFixed(cfg.dp)}–${b.to.toFixed(cfg.dp)} ${cfg.label}\n` +
            `${formatNumber(b.count)} postcode${b.count === 1 ? '' : 's'}` +
            (i === bins.length - 1 ? ' (includes everything above)' : '') +
            (b.count ? '\nClick to list them' : ''),
        })),
        {
          width: 960,
          height: 340,
          labelEvery: 2,
          yLabel: 'Postcodes',
          valueFormat: (v) => formatNumber(v),
          onClick: (id) => showBucket(bins[Number(id)], cfg),
        },
      ),
    );
    bucketEl.style.display = 'none';
  };

  const showBucket = (bin: ReturnType<typeof histogram>[number], cfg: (typeof CFG)[keyof typeof CFG]) => {
    if (!bin || bin.items.length === 0) {
      bucketEl.style.display = 'none';
      return;
    }
    bucketEl.style.display = '';
    bucketTitle.textContent = `${formatNumber(bin.count)} postcodes at ${bin.from.toFixed(cfg.dp)}–${bin.to.toFixed(cfg.dp)} ${cfg.label}`;
    bucketList.innerHTML = bin.items
      .slice()
      .sort((a, b) => b.dw - a.dw)
      .slice(0, 120)
      .map(
        (p) =>
          `<button class="chip" data-pc="${p.pc}" data-tip="${p.pc}${p.loc ? ` · ${p.loc}` : ''} (${p.st})&#10;${(p[metric] as number).toFixed(2)} ${cfg.label}">${p.pc}${p.loc ? ` ${p.loc}` : ''}</button>`,
      )
      .join('');
    bucketEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  bucketList.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-pc]');
    if (btn) ctx.openPostcode(btn.getAttribute('data-pc') as string);
  });

  root.querySelector('[data-role="metric"]')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-metric]');
    if (!btn) return;
    metric = btn.getAttribute('data-metric') as typeof metric;
    root.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-metric') === metric)));
    draw();
  });

  draw();
}
