import type { ViewContext } from '../viewContext';
import { STATE_ORDER, stateColour } from '../data';
import { el } from '../components/charts';
import { attachSvgZoom } from '../utils/svgZoom';
import { linearFit, rankable } from '../analysis';
import { glossaryTerm } from '../glossary';
import { escapeHtml, formatNumber, formatPer100 } from '../utils/format';
import type { Postcode } from '../types';

type XAxis = 'ownerSepShare' | 'rentShare' | 'flatShare';

const AXES: Record<XAxis, { label: string; desc: string }> = {
  ownerSepShare: {
    label: 'Owner-occupied detached houses',
    desc: 'Homes that are both free-standing and lived in by their owner — the households that control a roof and keep the savings.',
  },
  rentShare: {
    label: 'Rented homes',
    desc: 'The landlord buys the system, the tenant gets the cheaper power. Neither side has much reason to act — the split incentive.',
  },
  flatShare: {
    label: 'Flats and apartments',
    desc: 'The roof is common property shared by every owner in the block, so no single household can just install panels.',
  },
};

/**
 * The signature view: solar uptake against who owns the roof. This is the only
 * view that explains WHY postcodes differ, rather than just showing that they do.
 */
export function renderDivide(root: HTMLElement, ctx: ViewContext): void {
  let xAxis: XAxis = (localStorage.getItem('divide.x') as XAxis) || 'ownerSepShare';
  const hidden = new Set<string>();

  const points = rankable(ctx.data.postcodes).filter((p) => p.ownerSepShare != null && p.per100 != null);

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">The solar divide</h1>
      <p class="view-sub">
        Australia's rooftop solar is not spread by sunshine or by income alone — it follows who owns the roof.
        Each dot is a postcode. ${glossaryTerm('split-incentive', 'Why does this happen?')}
      </p>
    </div>
    <div class="controls">
      <span class="field-label">Compare against</span>
      <div class="seg" role="group" data-role="axis">
        ${(Object.keys(AXES) as XAxis[])
          .map((a) => `<button class="seg-btn" data-axis="${a}" aria-pressed="${a === xAxis}">${AXES[a].label}</button>`)
          .join('')}
      </div>
    </div>
    <div class="stat-grid" data-role="stats"></div>
    <div class="panel">
      <div class="panel-title" data-role="title"></div>
      <div class="panel-sub" data-role="sub"></div>
      <div class="chart-frame" data-role="frame"></div>
      <div class="legend" data-role="legend"></div>
      <p class="zoom-hint">Scroll to zoom about the cursor, drag to pan, double-click to reset. Click any dot to open that postcode.</p>
    </div>
  `;

  const frame = root.querySelector('[data-role="frame"]') as HTMLElement;
  const legendEl = root.querySelector('[data-role="legend"]') as HTMLElement;
  const statsEl = root.querySelector('[data-role="stats"]') as HTMLElement;
  const titleEl = root.querySelector('[data-role="title"]') as HTMLElement;
  const subEl = root.querySelector('[data-role="sub"]') as HTMLElement;

  const draw = () => {
    const cfg = AXES[xAxis];
    titleEl.textContent = `Solar uptake vs ${cfg.label.toLowerCase()}`;
    subEl.textContent = cfg.desc;

    const visible = points.filter((p) => !hidden.has(p.st));
    const fit = linearFit(visible.map((p) => ({ x: p[xAxis] as number, y: p.per100 as number })));

    // Headline stats.
    const r = fit?.r ?? 0;
    statsEl.innerHTML = `
      <div class="stat">
        <div class="stat-label">Correlation (r)</div>
        <div class="stat-value ${r >= 0 ? 'amber' : 'teal'}">${fit ? (r > 0 ? '+' : '') + r.toFixed(2) : '—'}</div>
        <div class="stat-note">${r >= 0 ? 'More of these, more solar' : 'More of these, less solar'}</div>
      </div>
      <div class="stat">
        <div class="stat-label">Variance explained (R²)</div>
        <div class="stat-value">${fit ? `${Math.round(fit.r2 * 100)}%` : '—'}</div>
        <div class="stat-note">of the gap between postcodes</div>
      </div>
      <div class="stat">
        <div class="stat-label">Postcodes plotted</div>
        <div class="stat-value">${formatNumber(visible.length)}</div>
        <div class="stat-note">200+ homes each</div>
      </div>
      <div class="stat">
        <div class="stat-label">Slope</div>
        <div class="stat-value">${fit ? (fit.slope > 0 ? '+' : '') + (fit.slope * 10).toFixed(1) : '—'}</div>
        <div class="stat-note">systems/100 homes per +10pp</div>
      </div>
    `;

    // Geometry.
    const width = 960;
    const height = 520;
    const m = { top: 20, right: 24, bottom: 54, left: 62 };
    const plotW = width - m.left - m.right;
    const plotH = height - m.top - m.bottom;
    const yMax = 120; // clip the above-100 postcodes; they're ringed and flagged separately
    const sx = (v: number) => m.left + (v / 100) * plotW;
    const sy = (v: number) => m.top + plotH - (Math.min(v, yMax) / yMax) * plotH;

    frame.innerHTML = '';
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });
    svg.setAttribute('aria-label', `Scatter plot of solar systems per 100 homes against ${cfg.label}`);

    // Grid.
    for (let t = 0; t <= 100; t += 20) {
      svg.appendChild(el('line', { class: 'grid-line', x1: sx(t), y1: m.top, x2: sx(t), y2: m.top + plotH }));
      const lx = el('text', { class: 'axis-label', x: sx(t), y: height - m.bottom + 16, 'text-anchor': 'middle' });
      lx.textContent = `${t}%`;
      svg.appendChild(lx);
    }
    for (let t = 0; t <= yMax; t += 20) {
      svg.appendChild(el('line', { class: 'grid-line', x1: m.left, y1: sy(t), x2: m.left + plotW, y2: sy(t) }));
      const ly = el('text', { class: 'axis-label', x: m.left - 8, y: sy(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' });
      ly.textContent = String(t);
      svg.appendChild(ly);
    }

    // Axis titles.
    const xt = el('text', { class: 'axis-label', x: m.left + plotW / 2, y: height - 12, 'text-anchor': 'middle', 'font-size': 12 });
    xt.textContent = `${cfg.label} — share of homes in the postcode`;
    svg.appendChild(xt);
    const yt = el('text', { class: 'axis-label', x: 14, y: m.top + plotH / 2, transform: `rotate(-90 14 ${m.top + plotH / 2})`, 'text-anchor': 'middle', 'font-size': 12 });
    yt.textContent = 'Solar systems per 100 homes';
    svg.appendChild(yt);

    // Dots. Small radius + low opacity so 2,000 points read as density.
    const dots = el('g');
    for (const p of visible) {
      const cx = sx(p[xAxis] as number);
      const cy = sy(p.per100 as number);
      const clipped = (p.per100 as number) > yMax;
      const c = el('circle', {
        cx,
        cy,
        r: 3,
        fill: stateColour(p.st),
        'fill-opacity': 0.5,
        stroke: clipped ? '#b91c1c' : 'none',
        'stroke-width': clipped ? 1.2 : 0,
        'data-pc': p.pc,
        'data-tip':
          `${p.pc}${p.loc ? ` · ${p.loc}` : ''} (${p.st})\n` +
          `${formatPer100(p.per100)} solar per 100 homes\n` +
          `${(p[xAxis] as number).toFixed(1)}% ${cfg.label.toLowerCase()}\n` +
          `${formatNumber(p.dw)} homes${clipped ? '\n⚠ more systems than 2021 homes — plotted at the ceiling' : ''}`,
        style: 'cursor:pointer',
      });
      dots.appendChild(c);
    }
    svg.appendChild(dots);

    // Trend line.
    if (fit) {
      const x1 = 0;
      const x2 = 100;
      const y1 = fit.intercept + fit.slope * x1;
      const y2 = fit.intercept + fit.slope * x2;
      svg.appendChild(
        el('line', {
          x1: sx(x1),
          y1: sy(Math.max(0, y1)),
          x2: sx(x2),
          y2: sy(Math.max(0, y2)),
          stroke: '#2b2113',
          'stroke-width': 2.5,
          'stroke-dasharray': '7 4',
          'data-tip': `Trend: r = ${fit.r.toFixed(2)}, R² = ${fit.r2.toFixed(2)} across ${formatNumber(fit.n)} postcodes`,
        }),
      );
    }

    frame.appendChild(svg);
    attachSvgZoom(svg, { maxScale: 12 });

    // Real clicks only — synthetic .click() would false-pass here.
    svg.addEventListener('click', (e) => {
      const dot = (e.target as Element).closest('[data-pc]');
      if (dot) ctx.openPostcode(dot.getAttribute('data-pc') as string);
    });

    legendEl.innerHTML =
      STATE_ORDER.map(
        (s) =>
          `<button class="legend-item" data-state="${s}" aria-pressed="${!hidden.has(s)}">
             <span class="legend-swatch" style="background:${stateColour(s)}"></span>${s}
           </button>`,
      ).join('') +
      `<span class="legend-item" style="cursor:default">
         <span class="legend-swatch" style="background:#fff;border:1.5px solid #b91c1c"></span>
         More systems than 2021 homes (plotted at the 120 ceiling)
       </span>`;
  };

  root.querySelector('[data-role="axis"]')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-axis]');
    if (!btn) return;
    xAxis = btn.getAttribute('data-axis') as XAxis;
    localStorage.setItem('divide.x', xAxis);
    root.querySelectorAll('[data-axis]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-axis') === xAxis)));
    draw();
  });

  legendEl.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-state]');
    if (!btn) return;
    const s = btn.getAttribute('data-state') as string;
    if (hidden.has(s)) hidden.delete(s);
    else hidden.add(s);
    draw();
  });

  draw();

  // Worked examples make the abstraction concrete.
  const extremes = document.createElement('div');
  extremes.className = 'panel';
  extremes.style.marginTop = 'var(--space-lg)';
  const sorted = points.slice().sort((a, b) => (b.per100 as number) - (a.per100 as number));
  const card = (p: Postcode, kind: string) => `
    <button class="insight ${kind === 'high' ? 'good' : 'alert'}" data-pc="${p.pc}" style="text-align:left;cursor:pointer;width:100%;border-width:1px 1px 1px 4px">
      <h3>${escapeHtml(p.pc)} · ${escapeHtml(p.loc || p.st)}</h3>
      <p>
        <strong style="font-family:var(--font-mono)">${formatPer100(p.per100)}</strong> solar per 100 homes ·
        ${p.ownerSepShare?.toFixed(0)}% owner-occupied houses · ${p.flatShare?.toFixed(0)}% apartments ·
        ${p.rentShare?.toFixed(0)}% rented
      </p>
    </button>`;
  extremes.innerHTML = `
    <div class="panel-title">The two ends of the divide</div>
    <div class="panel-sub">Same country, same subsidy, same sun — a difference of roughly ${Math.round(
      (sorted[0].per100 as number) / Math.max(0.1, sorted[sorted.length - 1].per100 as number),
    )}×.</div>
    <div class="insight-grid">
      ${sorted.slice(0, 3).map((p) => card(p, 'high')).join('')}
      ${sorted.slice(-3).reverse().map((p) => card(p, 'low')).join('')}
    </div>
  `;
  root.appendChild(extremes);
  extremes.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-pc]');
    if (btn) ctx.openPostcode(btn.getAttribute('data-pc') as string);
  });
}
