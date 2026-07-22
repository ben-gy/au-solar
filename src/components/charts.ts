// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Hand-rolled SVG chart primitives. No chart library — see factory rules. */
import { escapeHtml, formatCompact } from '../utils/format';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Nice round axis ceiling: 1/2/2.5/5 x 10^n above `max`. */
export function niceCeil(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(max));
  const norm = max / mag;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * mag;
}

/** Evenly spaced tick values from 0..max inclusive. */
export function ticks(max: number, count = 5): number[] {
  const top = niceCeil(max);
  return Array.from({ length: count + 1 }, (_, i) => (top / count) * i);
}

export interface HBarDatum {
  id: string;
  label: string;
  sub?: string;
  value: number;
  colour: string;
  tip: string;
  flag?: string;
}

/**
 * Horizontal ranked bars. Rows are fixed-height so the SVG grows with the data
 * and the caller can scroll it.
 */
export function horizontalBars(
  data: HBarDatum[],
  opts: { width?: number; rowHeight?: number; labelWidth?: number; valueFormat?: (v: number) => string; onClick?: (id: string) => void } = {},
): SVGSVGElement {
  const width = opts.width ?? 900;
  const rowH = opts.rowHeight ?? 26;
  const labelW = opts.labelWidth ?? 190;
  const fmt = opts.valueFormat ?? ((v: number) => formatCompact(v));
  const valueW = 62;
  const barMax = Math.max(60, width - labelW - valueW - 16);
  const height = Math.max(1, data.length) * rowH + 8;
  const max = niceCeil(Math.max(...data.map((d) => d.value), 0.0001));

  const svg = el('svg', {
    class: 'chart',
    viewBox: `0 0 ${width} ${height}`,
    width,
    height,
    role: 'img',
  });

  data.forEach((d, i) => {
    const y = i * rowH + 4;
    const g = el('g', { class: 'bar-row' });

    const label = el('text', {
      x: labelW - 8,
      y: y + rowH / 2,
      'text-anchor': 'end',
      'dominant-baseline': 'middle',
      'font-size': 11.5,
    });
    label.textContent = d.label;
    g.appendChild(label);

    const track = el('rect', {
      x: labelW,
      y: y + 2,
      width: barMax,
      height: rowH - 8,
      rx: 3,
      fill: '#fef6e3',
    });
    g.appendChild(track);

    const w = Math.max(1, (d.value / max) * barMax);
    const bar = el('rect', {
      class: 'bar',
      x: labelW,
      y: y + 2,
      width: w,
      height: rowH - 8,
      rx: 3,
      fill: d.colour,
      'data-tip': d.tip,
      'data-id': d.id,
      'aria-label': d.tip,
      tabindex: 0,
      role: 'button',
    });
    g.appendChild(bar);

    const val = el('text', {
      class: 'val-label',
      x: labelW + barMax + 8,
      y: y + rowH / 2,
      'dominant-baseline': 'middle',
    });
    val.textContent = fmt(d.value) + (d.flag ? ` ${d.flag}` : '');
    g.appendChild(val);

    // The whole row is the hit target so thin bars stay clickable.
    const hit = el('rect', {
      x: 0,
      y,
      width,
      height: rowH,
      fill: 'transparent',
      'data-id': d.id,
      style: 'cursor:pointer',
      'data-tip': d.tip,
    });
    g.appendChild(hit);

    if (opts.onClick) {
      const fire = () => opts.onClick!(d.id);
      g.addEventListener('click', fire);
      bar.addEventListener('keydown', (e) => {
        if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
          e.preventDefault();
          fire();
        }
      });
    }
    svg.appendChild(g);
  });

  return svg;
}

export interface ColumnDatum {
  id: string;
  label: string;
  value: number;
  colour: string;
  tip: string;
  /** Provisional months render hatched — see the reporting-lag rule. */
  hatched?: boolean;
}

export interface ColumnOpts {
  width?: number;
  height?: number;
  yLabel?: string;
  labelEvery?: number;
  onClick?: (id: string) => void;
  annotations?: Array<{ atLabel: string; text: string; colour?: string }>;
  valueFormat?: (v: number) => string;
}

/** Vertical column chart with optional milestone annotations. */
export function columnChart(data: ColumnDatum[], opts: ColumnOpts = {}): SVGSVGElement {
  const width = opts.width ?? 960;
  const height = opts.height ?? 340;
  const m = { top: 18, right: 16, bottom: 44, left: 56 };
  const plotW = width - m.left - m.right;
  const plotH = height - m.top - m.bottom;
  const max = niceCeil(Math.max(...data.map((d) => d.value), 0.0001));
  const fmt = opts.valueFormat ?? ((v: number) => formatCompact(v));

  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, role: 'img' });

  // Hatch pattern for provisional data.
  const defs = el('defs');
  const pat = el('pattern', {
    id: 'hatch',
    width: 5,
    height: 5,
    patternUnits: 'userSpaceOnUse',
    patternTransform: 'rotate(45)',
  });
  pat.appendChild(el('rect', { width: 5, height: 5, fill: '#fde8c8' }));
  pat.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: '#d97706', 'stroke-width': 2 }));
  defs.appendChild(pat);
  svg.appendChild(defs);

  // Y grid + ticks.
  for (const t of ticks(max, 4)) {
    const y = m.top + plotH - (t / max) * plotH;
    svg.appendChild(el('line', { class: 'grid-line', x1: m.left, y1: y, x2: m.left + plotW, y2: y }));
    const lbl = el('text', { class: 'axis-label', x: m.left - 8, y, 'text-anchor': 'end', 'dominant-baseline': 'middle' });
    lbl.textContent = fmt(t);
    svg.appendChild(lbl);
  }

  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(1, slot * 0.78);
  const labelEvery = opts.labelEvery ?? Math.max(1, Math.ceil(data.length / 14));

  data.forEach((d, i) => {
    const x = m.left + i * slot + (slot - barW) / 2;
    const h = Math.max(0.5, (d.value / max) * plotH);
    const y = m.top + plotH - h;
    const bar = el('rect', {
      class: 'bar',
      x,
      y,
      width: barW,
      height: h,
      rx: Math.min(2, barW / 3),
      fill: d.hatched ? 'url(#hatch)' : d.colour,
      'data-tip': d.tip,
      'aria-label': d.tip,
    });
    if (d.hatched) bar.setAttribute('stroke', '#d97706'), bar.setAttribute('stroke-width', '0.5');
    if (opts.onClick) {
      bar.style.cursor = 'pointer';
      bar.addEventListener('click', () => opts.onClick!(d.id));
    }
    svg.appendChild(bar);

    // Widen the hover target for thin bars.
    if (barW < 8) {
      svg.appendChild(
        el('rect', { x: m.left + i * slot, y: m.top, width: slot, height: plotH, fill: 'transparent', 'data-tip': d.tip }),
      );
    }

    if (i % labelEvery === 0) {
      const lbl = el('text', {
        class: 'axis-label',
        x: x + barW / 2,
        y: height - m.bottom + 14,
        'text-anchor': 'middle',
      });
      lbl.textContent = d.label;
      svg.appendChild(lbl);
    }
  });

  // Milestone annotations.
  for (const a of opts.annotations ?? []) {
    const idx = data.findIndex((d) => d.id === a.atLabel);
    if (idx < 0) continue;
    const x = m.left + idx * slot + slot / 2;
    const colour = a.colour ?? '#0f766e';
    svg.appendChild(
      el('line', { x1: x, y1: m.top, x2: x, y2: m.top + plotH, stroke: colour, 'stroke-width': 1.2, 'stroke-dasharray': '3 3', opacity: 0.85 }),
    );
    const dot = el('circle', { cx: x, cy: m.top, r: 4, fill: colour, 'data-tip': a.text, style: 'cursor:help' });
    svg.appendChild(dot);
  }

  svg.appendChild(el('line', { class: 'axis-line', x1: m.left, y1: m.top + plotH, x2: m.left + plotW, y2: m.top + plotH }));

  if (opts.yLabel) {
    const yl = el('text', { class: 'axis-label', x: 12, y: m.top + plotH / 2, transform: `rotate(-90 12 ${m.top + plotH / 2})`, 'text-anchor': 'middle' });
    yl.textContent = opts.yLabel;
    svg.appendChild(yl);
  }

  return svg;
}

/** Tiny inline sparkline for table rows. */
export function sparkline(values: number[], colour = '#f59e0b'): string {
  if (values.length === 0) return '';
  const w = 84;
  const h = 20;
  const max = Math.max(...values, 1);
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(' ');
  const area = `M0,${h} L${pts.split(' ').join(' L')} L${w},${h} Z`;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${escapeHtml(area)}" fill="${colour}" opacity="0.16"/><polyline points="${pts}" fill="none" stroke="${colour}" stroke-width="1.3"/></svg>`;
}

/** Sequential amber ramp for the choropleth and legends. */
export const RAMP = ['#fff7e6', '#fee9bf', '#fdd28a', '#fbb650', '#f59e0b', '#d97706', '#a1560a'];

export function rampColour(value: number | null, stops: number[]): string {
  if (value == null || !Number.isFinite(value)) return '#e8e2d6';
  for (let i = 0; i < stops.length; i++) {
    if (value < stops[i]) return RAMP[i];
  }
  return RAMP[RAMP.length - 1];
}
