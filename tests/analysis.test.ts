import { describe, expect, it } from 'vitest';
import { aggregateByState, buildInsights, histogram, linearFit, median, quantile, rankable, rankedByPer100 } from '../src/analysis';
import type { Postcode } from '../src/types';

function pc(over: Partial<Postcode> = {}): Postcode {
  return {
    pc: '3000',
    loc: 'Melbourne',
    locs: ['Melbourne'],
    st: 'VIC',
    lat: -37.8,
    lng: 144.9,
    sa4: '',
    lga: '',
    dw: 1000,
    solar: 500,
    kw: 3000,
    bat: 20,
    kwh: 200,
    per100: 50,
    batPer100: 2,
    avgKw: 6,
    ownerSepShare: 40,
    rentShare: 30,
    flatShare: 20,
    sepHouse: 600,
    flatCount: 200,
    ownOut: 300,
    ownMtg: 300,
    rented: 300,
    yr: [1, 2, 3],
    ...over,
  };
}

describe('median', () => {
  it('handles odd counts', () => expect(median([3, 1, 2])).toBe(2));
  it('averages the middle two on even counts', () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it('returns 0 for empty input', () => expect(median([])).toBe(0));
  it('ignores non-finite values', () => expect(median([1, NaN, 3])).toBe(2));
});

describe('quantile', () => {
  const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  it('finds the median at q=0.5', () => expect(quantile(v, 0.5)).toBeCloseTo(5.5));
  it('finds the minimum at q=0', () => expect(quantile(v, 0)).toBe(1));
  it('finds the maximum at q=1', () => expect(quantile(v, 1)).toBe(10));
  it('interpolates between points', () => expect(quantile([0, 10], 0.25)).toBeCloseTo(2.5));
  it('clamps out-of-range q', () => expect(quantile(v, 5)).toBe(10));
  it('returns 0 for empty input', () => expect(quantile([], 0.5)).toBe(0));
});

describe('rankable', () => {
  it('keeps postcodes with enough homes and a ratio', () => {
    expect(rankable([pc()])).toHaveLength(1);
  });
  it('drops tiny postcodes that would win on noise', () => {
    expect(rankable([pc({ dw: 9, per100: 900 })])).toHaveLength(0);
  });
  it('drops postcodes with no denominator', () => {
    expect(rankable([pc({ per100: null })])).toHaveLength(0);
  });
});

describe('rankedByPer100', () => {
  // Regression: the drill-down once ranked against the unsorted rankable()
  // output and reported #1603 for the highest-uptake postcode in the country.
  const all = [
    pc({ pc: '1111', per100: 10 }),
    pc({ pc: '2222', per100: 203 }),
    pc({ pc: '3333', per100: 56 }),
    pc({ pc: '4444', per100: 900, dw: 5 }), // too few homes to rank
  ];

  it('puts the highest penetration first', () => {
    expect(rankedByPer100(all)[0].pc).toBe('2222');
  });

  it('orders strictly descending', () => {
    const r = rankedByPer100(all);
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].per100 as number).toBeGreaterThanOrEqual(r[i].per100 as number);
    }
  });

  it('gives the top postcode index 0, so its displayed rank is #1', () => {
    const r = rankedByPer100(all);
    expect(r.findIndex((p) => p.pc === '2222') + 1).toBe(1);
  });

  it('still excludes postcodes below the dwelling floor', () => {
    expect(rankedByPer100(all).some((p) => p.pc === '4444')).toBe(false);
  });

  it('does not mutate the caller array order', () => {
    const input = [pc({ pc: 'a', per100: 1 }), pc({ pc: 'b', per100: 99 })];
    rankedByPer100(input);
    expect(input.map((p) => p.pc)).toEqual(['a', 'b']);
  });
});

describe('linearFit', () => {
  it('recovers slope, intercept and r for a perfect line', () => {
    const fit = linearFit([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 4 },
      { x: 3, y: 6 },
    ])!;
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(0);
    expect(fit.r2).toBeCloseTo(1);
    expect(fit.n).toBe(4);
  });

  it('reports a negative correlation for an inverse relationship', () => {
    const fit = linearFit([
      { x: 0, y: 10 },
      { x: 1, y: 8 },
      { x: 2, y: 6 },
    ])!;
    expect(fit.slope).toBeLessThan(0);
    expect(fit.r).toBeCloseTo(-1);
  });

  it('ignores non-finite points', () => {
    const fit = linearFit([
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: NaN, y: 5 },
    ])!;
    expect(fit.n).toBe(2);
  });

  it('returns null when x has no variance', () => {
    expect(
      linearFit([
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ]),
    ).toBeNull();
  });

  it('never returns NaN for r when y is constant', () => {
    const fit = linearFit([
      { x: 1, y: 5 },
      { x: 2, y: 5 },
    ])!;
    expect(Number.isFinite(fit.r)).toBe(true);
    expect(fit.r).toBe(0);
  });
});

describe('histogram', () => {
  const items = [pc({ per100: 0 }), pc({ per100: 5 }), pc({ per100: 50 }), pc({ per100: 99 })];

  it('creates the requested number of bins', () => {
    expect(histogram(items, (p) => p.per100, 10, 100)).toHaveLength(10);
  });

  it('assigns every item to exactly one bin', () => {
    const bins = histogram(items, (p) => p.per100, 10, 100);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(items.length);
  });

  it('puts values at or above max in the final bin', () => {
    const bins = histogram([pc({ per100: 250 })], (p) => p.per100, 10, 100);
    expect(bins[9].count).toBe(1);
  });

  it('clamps negatives into the first bin', () => {
    const bins = histogram([pc({ per100: -5 })], (p) => p.per100, 10, 100);
    expect(bins[0].count).toBe(1);
  });

  it('skips null values', () => {
    const bins = histogram([pc({ per100: null })], (p) => p.per100, 10, 100);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(0);
  });

  it('produces contiguous non-overlapping bin edges', () => {
    const bins = histogram(items, (p) => p.per100, 10, 100);
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].from).toBeCloseTo(bins[i - 1].to);
    }
    expect(bins[0].from).toBe(0);
    expect(bins[bins.length - 1].to).toBeCloseTo(100);
  });
});

describe('aggregateByState', () => {
  it('sums installs and recomputes ratios from totals, not averages of ratios', () => {
    const aggs = aggregateByState([
      pc({ st: 'VIC', solar: 100, dw: 1000, bat: 10 }),
      pc({ st: 'VIC', solar: 400, dw: 1000, bat: 30 }),
    ]);
    expect(aggs).toHaveLength(1);
    expect(aggs[0].solar).toBe(500);
    expect(aggs[0].dwellings).toBe(2000);
    expect(aggs[0].per100).toBeCloseTo(25);
    expect(aggs[0].batPer100).toBeCloseTo(2);
  });

  it('ignores postcodes with no state', () => {
    expect(aggregateByState([pc({ st: '' })])).toHaveLength(0);
  });

  it('does not divide by zero when a state has no dwellings', () => {
    const aggs = aggregateByState([pc({ st: 'NT', dw: 0, solar: 10 })]);
    expect(aggs[0].per100).toBe(0);
  });

  it('sorts by penetration descending', () => {
    const aggs = aggregateByState([
      pc({ st: 'VIC', solar: 100, dw: 1000 }),
      pc({ st: 'QLD', solar: 900, dw: 1000 }),
    ]);
    expect(aggs.map((a) => a.state)).toEqual(['QLD', 'VIC']);
  });
});

describe('buildInsights', () => {
  const many = [
    ...Array.from({ length: 60 }, (_, i) =>
      pc({ pc: String(4000 + i), st: 'QLD', per100: 20 + i, ownerSepShare: 20 + i, rentShare: 60 - i * 0.5, flatShare: 5 }),
    ),
    pc({ pc: '3000', st: 'VIC', per100: 0.5, ownerSepShare: 0, flatShare: 99, rentShare: 70 }),
  ];

  it('produces insights from a realistic dataset', () => {
    const out = buildInsights({ all: many, nationalPer100: 47.8, battTotal: 401185, battMonths: 11 });
    expect(out.length).toBeGreaterThan(2);
  });

  it('leads with the top-vs-bottom gap', () => {
    const out = buildInsights({ all: many, nationalPer100: 47.8, battTotal: 0, battMonths: 0 });
    expect(out[0].title).toMatch(/solar gap/i);
    expect(out[0].postcodes).toContain('3000');
  });

  it('reports the ownership correlation', () => {
    const out = buildInsights({ all: many, nationalPer100: 47.8, battTotal: 0, battMonths: 0 });
    expect(out.some((i) => /explains \d+% of the difference/.test(i.title))).toBe(true);
  });

  it('omits the battery insight when there are no batteries', () => {
    const out = buildInsights({ all: many, nationalPer100: 47.8, battTotal: 0, battMonths: 0 });
    expect(out.some((i) => /batteries in/.test(i.title))).toBe(false);
  });

  it('includes the battery insight when batteries exist', () => {
    const out = buildInsights({ all: many, nationalPer100: 47.8, battTotal: 401185, battMonths: 11 });
    expect(out.some((i) => /401,185 home batteries/.test(i.title))).toBe(true);
  });

  it('returns an empty list rather than throwing on empty input', () => {
    expect(buildInsights({ all: [], nationalPer100: 0, battTotal: 0, battMonths: 0 })).toEqual([]);
  });

  it('never emits NaN or undefined in rendered text', () => {
    const out = buildInsights({ all: many, nationalPer100: 47.8, battTotal: 401185, battMonths: 11 });
    for (const i of out) {
      expect(i.title).not.toMatch(/NaN|undefined/);
      expect(i.body).not.toMatch(/NaN|undefined/);
    }
  });
});
