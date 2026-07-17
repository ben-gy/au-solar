// Position-asserting layout tests for the hand-rolled SVG charts.
//
// WHY POSITIONS, NOT AREAS: an implementation that stacks every bar at the same
// origin conserves total area perfectly and still renders as garbage. Bounds,
// pairwise overlap, and monotonic ordering are what actually catch it.
import { describe, expect, it } from 'vitest';
import { columnChart, horizontalBars, niceCeil, ticks, rampColour, RAMP, sparkline } from '../src/components/charts';
import { zoomViewBox, clampViewBox } from '../src/utils/svgZoom';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOf(svg: SVGSVGElement, selector: string): Rect[] {
  return [...svg.querySelectorAll(selector)].map((r) => ({
    x: Number(r.getAttribute('x')),
    y: Number(r.getAttribute('y')),
    w: Number(r.getAttribute('width')),
    h: Number(r.getAttribute('height')),
  }));
}

function overlapArea(a: Rect, b: Rect): number {
  const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return ox * oy;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(11);

const datum = (i: number, value: number) => ({
  id: `id${i}`,
  label: `Label ${i}`,
  value,
  colour: '#f59e0b',
  tip: `tip ${i}`,
});

describe('niceCeil', () => {
  it('rounds up to a clean 1/2/2.5/5 x 10^n', () => {
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(1.4)).toBe(2);
    expect(niceCeil(230)).toBe(250);
    expect(niceCeil(4200)).toBe(5000);
  });
  it('never returns 0 or a negative for degenerate input', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(NaN)).toBe(1);
  });
  it('is always >= the input', () => {
    for (let i = 0; i < 40; i++) {
      const v = rand() * 10000;
      expect(niceCeil(v)).toBeGreaterThanOrEqual(v);
    }
  });
});

describe('ticks', () => {
  it('starts at 0 and ends at the nice ceiling', () => {
    const t = ticks(7, 5);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBe(10);
    expect(t).toHaveLength(6);
  });
  it('is strictly increasing with no NaN', () => {
    const t = ticks(4321, 4);
    for (let i = 1; i < t.length; i++) {
      expect(Number.isFinite(t[i])).toBe(true);
      expect(t[i]).toBeGreaterThan(t[i - 1]);
    }
  });
});

describe('horizontalBars — positional correctness', () => {
  const sets: number[][] = [
    [10, 5, 2, 1],
    [100],
    Array.from({ length: 30 }, (_, i) => 30 - i),
    Array.from({ length: 50 }, () => 1 + Math.floor(rand() * 500)),
  ];

  for (const values of sets) {
    it(`lays out ${values.length} bars: in-bounds, no NaN, no vertical overlap`, () => {
      const width = 900;
      const rowHeight = 26;
      const labelWidth = 190;
      const svg = horizontalBars(values.map((v, i) => datum(i, v)), { width, rowHeight, labelWidth });
      const bars = rectsOf(svg, 'rect.bar');
      expect(bars).toHaveLength(values.length);

      const height = Number(svg.getAttribute('height'));

      for (const b of bars) {
        for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
        expect(b.w).toBeGreaterThan(0);
        expect(b.h).toBeGreaterThan(0);
        // In bounds.
        expect(b.x).toBeGreaterThanOrEqual(labelWidth - 1e-6);
        expect(b.x + b.w).toBeLessThanOrEqual(width + 1e-6);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(height + 1e-6);
      }

      // Rows must not collide — this is what catches "everything at y=0".
      for (let i = 0; i < bars.length; i++) {
        for (let j = i + 1; j < bars.length; j++) {
          expect(overlapArea(bars[i], bars[j])).toBeLessThan(0.5);
        }
      }
    });
  }

  it('scales bar width proportionally to value', () => {
    const svg = horizontalBars([100, 50].map((v, i) => datum(i, v)), { width: 900, labelWidth: 100 });
    const [big, small] = rectsOf(svg, 'rect.bar');
    expect(big.w / small.w).toBeCloseTo(2, 1);
  });

  it('gives a zero value a visible sliver rather than a NaN or negative width', () => {
    const svg = horizontalBars([0, 10].map((v, i) => datum(i, v)), {});
    const bars = rectsOf(svg, 'rect.bar');
    expect(bars[0].w).toBeGreaterThan(0);
    expect(Number.isFinite(bars[0].w)).toBe(true);
  });

  it('survives an all-zero dataset without NaN', () => {
    const svg = horizontalBars([0, 0, 0].map((v, i) => datum(i, v)), {});
    for (const b of rectsOf(svg, 'rect.bar')) {
      expect(Number.isFinite(b.w)).toBe(true);
      expect(b.w).toBeGreaterThan(0);
    }
  });

  it('renders an empty dataset without throwing', () => {
    expect(() => horizontalBars([], {})).not.toThrow();
  });

  it('puts a data-tip on every bar', () => {
    const svg = horizontalBars([5, 3].map((v, i) => datum(i, v)), {});
    for (const bar of svg.querySelectorAll('rect.bar')) {
      expect(bar.getAttribute('data-tip')).toBeTruthy();
    }
  });
});

describe('columnChart — positional correctness', () => {
  const sets: number[][] = [
    [5, 10, 3],
    [1],
    Array.from({ length: 26 }, (_, i) => i * 100),
    Array.from({ length: 302 }, () => Math.floor(rand() * 40000)),
  ];

  for (const values of sets) {
    it(`lays out ${values.length} columns: in-bounds, no NaN, no horizontal overlap`, () => {
      const width = 960;
      const height = 340;
      const svg = columnChart(values.map((v, i) => datum(i, v)), { width, height });
      const bars = rectsOf(svg, 'rect.bar');
      expect(bars).toHaveLength(values.length);

      for (const b of bars) {
        for (const v of Object.values(b)) expect(Number.isFinite(v)).toBe(true);
        expect(b.w).toBeGreaterThan(0);
        expect(b.h).toBeGreaterThan(0);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(width + 1e-6);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.y + b.h).toBeLessThanOrEqual(height + 1e-6);
      }

      for (let i = 0; i < bars.length; i++) {
        for (let j = i + 1; j < bars.length; j++) {
          expect(overlapArea(bars[i], bars[j])).toBeLessThan(0.5);
        }
      }
    });
  }

  it('orders columns left to right in input order', () => {
    const svg = columnChart([1, 2, 3, 4].map((v, i) => datum(i, v)), {});
    const bars = rectsOf(svg, 'rect.bar');
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].x).toBeGreaterThan(bars[i - 1].x);
    }
  });

  it('makes a larger value a taller bar with a smaller y', () => {
    const svg = columnChart([10, 20].map((v, i) => datum(i, v)), {});
    const [a, b] = rectsOf(svg, 'rect.bar');
    expect(b.h).toBeGreaterThan(a.h);
    expect(b.y).toBeLessThan(a.y);
  });

  it('bottoms every column on the same baseline', () => {
    const svg = columnChart([10, 20, 5].map((v, i) => datum(i, v)), {});
    const bars = rectsOf(svg, 'rect.bar');
    const baselines = bars.map((b) => b.y + b.h);
    for (const bl of baselines) expect(bl).toBeCloseTo(baselines[0], 6);
  });

  it('hatches provisional columns instead of using the solid fill', () => {
    const svg = columnChart(
      [
        { ...datum(0, 10), hatched: false },
        { ...datum(1, 10), hatched: true },
      ],
      {},
    );
    const bars = [...svg.querySelectorAll('rect.bar')];
    expect(bars[0].getAttribute('fill')).toBe('#f59e0b');
    expect(bars[1].getAttribute('fill')).toBe('url(#hatch)');
  });

  it('survives an all-zero dataset without NaN', () => {
    const svg = columnChart([0, 0].map((v, i) => datum(i, v)), {});
    for (const b of rectsOf(svg, 'rect.bar')) {
      expect(Number.isFinite(b.h)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
    }
  });

  it('renders an empty dataset without throwing', () => {
    expect(() => columnChart([], {})).not.toThrow();
  });
});

describe('sparkline', () => {
  it('emits no NaN coordinates', () => {
    expect(sparkline([1, 5, 3, 9])).not.toMatch(/NaN/);
  });
  it('handles an all-zero series without dividing by zero', () => {
    expect(sparkline([0, 0, 0])).not.toMatch(/NaN/);
  });
  it('returns empty string for no data', () => {
    expect(sparkline([])).toBe('');
  });
  it('handles a single point', () => {
    expect(sparkline([5])).not.toMatch(/NaN/);
  });
});

describe('rampColour', () => {
  const stops = [10, 25, 40, 55, 70, 90];
  it('maps below the first stop to the lightest colour', () => {
    expect(rampColour(1, stops)).toBe(RAMP[0]);
  });
  it('maps above the last stop to the darkest colour', () => {
    expect(rampColour(200, stops)).toBe(RAMP[RAMP.length - 1]);
  });
  it('increases monotonically through the ramp', () => {
    const seen = [0, 12, 30, 45, 60, 80, 100].map((v) => RAMP.indexOf(rampColour(v, stops)));
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
  });
  it('uses the no-data colour for null', () => {
    expect(rampColour(null, stops)).toBe('#e8e2d6');
  });
});

describe('svgZoom viewBox maths', () => {
  const base = { x: 0, y: 0, w: 100, h: 100 };

  it('never zooms out past the base box', () => {
    const vb = zoomViewBox(base, base, 0.5, 50, 50);
    expect(vb.w).toBeLessThanOrEqual(base.w + 1e-9);
  });

  it('zooms in about the cursor and stays inside the base box', () => {
    const vb = zoomViewBox(base, base, 2, 25, 25);
    expect(vb.w).toBeCloseTo(50);
    expect(vb.x).toBeGreaterThanOrEqual(base.x - 1e-9);
    expect(vb.y).toBeGreaterThanOrEqual(base.y - 1e-9);
    expect(vb.x + vb.w).toBeLessThanOrEqual(base.x + base.w + 1e-9);
  });

  it('clamps a panned box back inside the base', () => {
    const vb = clampViewBox({ x: -50, y: 200, w: 50, h: 50 }, base);
    expect(vb.x).toBe(0);
    expect(vb.y).toBe(50);
  });

  it('respects the max scale', () => {
    let vb = { ...base };
    for (let i = 0; i < 20; i++) vb = zoomViewBox(vb, base, 2, 50, 50, 1, 8);
    expect(vb.w).toBeCloseTo(base.w / 8);
  });

  it('produces no NaN coordinates', () => {
    const vb = zoomViewBox(base, base, 1.4, 0, 0);
    for (const v of Object.values(vb)) expect(Number.isFinite(v)).toBe(true);
  });
});
