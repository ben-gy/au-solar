import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatCompact,
  formatDate,
  formatKw,
  formatKwh,
  formatMonth,
  formatNumber,
  formatPer100,
  formatPercent,
  postcodeLabel,
} from '../src/utils/format';
import { searchPostcodes, isGrowthCorridor, stateColour } from '../src/data';
import type { Postcode } from '../src/types';

describe('formatNumber', () => {
  it('formats thousands with commas', () => expect(formatNumber(1234567)).toBe('1,234,567'));
  it('handles zero', () => expect(formatNumber(0)).toBe('0'));
  it('handles negatives', () => expect(formatNumber(-1234)).toBe('-1,234'));
  it('honours decimal places', () => expect(formatNumber(1234.56, 2)).toBe('1,234.56'));
  it('renders an em dash for null', () => expect(formatNumber(null)).toBe('—'));
  it('renders an em dash for NaN', () => expect(formatNumber(NaN)).toBe('—'));
});

describe('formatPer100', () => {
  it('always shows one decimal', () => expect(formatPer100(47)).toBe('47.0'));
  it('rounds to one decimal', () => expect(formatPer100(47.85)).toBe('47.9'));
  it('handles null', () => expect(formatPer100(null)).toBe('—'));
});

describe('formatPercent', () => {
  it('appends a percent sign', () => expect(formatPercent(12.34)).toBe('12.3%'));
  it('honours zero decimal places', () => expect(formatPercent(12.6, 0)).toBe('13%'));
  it('handles null', () => expect(formatPercent(null)).toBe('—'));
});

describe('formatKw', () => {
  it('keeps small values in kW', () => expect(formatKw(500)).toBe('500 kW'));
  it('promotes thousands to MW', () => expect(formatKw(1500)).toBe('1.50 MW'));
  it('promotes millions to GW', () => expect(formatKw(2_500_000)).toBe('2.50 GW'));
  it('handles zero', () => expect(formatKw(0)).toBe('0 kW'));
  it('handles null', () => expect(formatKw(null)).toBe('—'));
});

describe('formatKwh', () => {
  it('promotes to MWh', () => expect(formatKwh(2500)).toBe('2.50 MWh'));
  it('promotes to GWh', () => expect(formatKwh(3_000_000)).toBe('3.00 GWh'));
  it('handles null', () => expect(formatKwh(null)).toBe('—'));
});

describe('formatCompact', () => {
  it('abbreviates thousands', () => expect(formatCompact(1500)).toBe('1.5k'));
  it('drops the decimal above 10k', () => expect(formatCompact(15000)).toBe('15k'));
  it('abbreviates millions', () => expect(formatCompact(1_500_000)).toBe('1.5M'));
  it('leaves small numbers alone', () => expect(formatCompact(42)).toBe('42'));
  it('handles negatives', () => expect(formatCompact(-1500)).toBe('-1.5k'));
});

describe('formatMonth', () => {
  it('renders a month key', () => expect(formatMonth('2026-05')).toBe('May 2026'));
  it('renders January', () => expect(formatMonth('2001-01')).toBe('Jan 2001'));
  it('passes through junk unchanged', () => expect(formatMonth('nope')).toBe('nope'));
  it('passes through an out-of-range month', () => expect(formatMonth('2026-13')).toBe('2026-13'));
});

describe('formatDate', () => {
  it('formats an ISO timestamp', () => expect(formatDate('2026-07-17T00:00:00.000Z')).toMatch(/2026/));
  it('handles junk', () => expect(formatDate('nope')).toBe('—'));
});

describe('postcodeLabel', () => {
  it('joins postcode and locality', () => expect(postcodeLabel('3000', 'Melbourne')).toBe('3000 · Melbourne'));
  it('falls back to the bare postcode', () => expect(postcodeLabel('3000', '')).toBe('3000'));
});

describe('escapeHtml', () => {
  it('escapes angle brackets and quotes', () => {
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
  });
  it('escapes ampersands', () => expect(escapeHtml('a & b')).toBe('a &amp; b'));
  it('leaves plain text alone', () => expect(escapeHtml('Angle Vale')).toBe('Angle Vale'));
});

describe('stateColour', () => {
  it('returns a distinct colour per state', () => {
    expect(stateColour('NSW')).not.toBe(stateColour('VIC'));
  });
  it('falls back to grey for an unknown state', () => expect(stateColour('XX')).toBe('#94a3b8'));
});

function mk(over: Partial<Postcode>): Postcode {
  return {
    pc: '3000', loc: 'Melbourne', locs: ['Melbourne'], st: 'VIC', lat: 0, lng: 0, sa4: '', lga: '',
    dw: 1000, solar: 500, kw: 0, bat: 0, kwh: 0, per100: 50, batPer100: 0, avgKw: 6,
    ownerSepShare: 40, rentShare: 30, flatShare: 20, sepHouse: 0, flatCount: 0,
    ownOut: 0, ownMtg: 0, rented: 0, yr: [], ...over,
  };
}

describe('isGrowthCorridor', () => {
  it('flags postcodes above 100 systems per 100 homes', () => {
    expect(isGrowthCorridor(mk({ per100: 203 }))).toBe(true);
  });
  it('does not flag a normal postcode', () => {
    expect(isGrowthCorridor(mk({ per100: 50 }))).toBe(false);
  });
  it('does not flag a postcode with no denominator', () => {
    expect(isGrowthCorridor(mk({ per100: null }))).toBe(false);
  });
});

describe('searchPostcodes', () => {
  const all = [
    mk({ pc: '3000', loc: 'Melbourne', locs: ['Melbourne'] }),
    mk({ pc: '3001', loc: 'Melbourne', locs: ['Melbourne'] }),
    mk({ pc: '5117', loc: 'Angle Vale', locs: ['Angle Vale'], st: 'SA' }),
    mk({ pc: '2000', loc: 'Sydney', locs: ['Sydney', 'Barangaroo'] }),
  ];

  it('finds an exact postcode first', () => {
    expect(searchPostcodes(all, '3000')[0].pc).toBe('3000');
  });
  it('matches a postcode prefix', () => {
    expect(searchPostcodes(all, '300').map((p) => p.pc)).toEqual(expect.arrayContaining(['3000', '3001']));
  });
  it('matches a locality name', () => {
    expect(searchPostcodes(all, 'angle')[0].pc).toBe('5117');
  });
  it('matches a secondary locality', () => {
    expect(searchPostcodes(all, 'barangaroo')[0].pc).toBe('2000');
  });
  it('is case-insensitive', () => {
    expect(searchPostcodes(all, 'MELBOURNE').length).toBeGreaterThan(0);
  });
  it('returns nothing for an empty query', () => {
    expect(searchPostcodes(all, '   ')).toEqual([]);
  });
  it('returns nothing for no match', () => {
    expect(searchPostcodes(all, 'zzzzz')).toEqual([]);
  });
  it('respects the limit', () => {
    expect(searchPostcodes(all, '', 2)).toHaveLength(0);
    expect(searchPostcodes(all, '3', 1)).toHaveLength(1);
  });
});
