import { describe, expect, it } from 'vitest';
import { parseCSV, parseTable, num } from '../pipeline/lib/csv.mjs';
import { pickPrimaryLocality } from '../pipeline/aggregate.mjs';
import { parseMonthHeader, normalisePostcode, readWideTable, detectIncompleteMonths, linearFit, mergeMonthKeys } from '../pipeline/lib/transform.mjs';

describe('parseCSV', () => {
  it('parses a simple row', () => {
    expect(parseCSV('a,b,c')).toEqual([['a', 'b', 'c']]);
  });

  it('keeps quoted thousands separators in one field', () => {
    // THE bug this parser exists for: a naive split(',') turns 1 field into 2
    // and shifts every column after it.
    expect(parseCSV('2000,"1,234",7')).toEqual([['2000', '1,234', '7']]);
  });

  it('handles escaped double quotes', () => {
    expect(parseCSV('a,"say ""hi""",b')).toEqual([['a', 'say "hi"', 'b']]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCSV('a,b\r\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('handles an empty trailing field', () => {
    expect(parseCSV('a,b,')).toEqual([['a', 'b', '']]);
  });

  it('handles a newline inside a quoted field', () => {
    expect(parseCSV('a,"line1\nline2",c')).toEqual([['a', 'line1\nline2', 'c']]);
  });
});

describe('parseTable', () => {
  it('drops rows with the wrong column count', () => {
    const t = parseTable('a,b,c\n1,2,3\n4,5\n6,7,8');
    expect(t.header).toEqual(['a', 'b', 'c']);
    expect(t.rows).toHaveLength(2);
  });

  it('returns empty structures for empty input', () => {
    expect(parseTable('')).toEqual({ header: [], rows: [] });
  });
});

describe('num', () => {
  it('strips thousands separators', () => {
    expect(num('1,234,567')).toBe(1234567);
  });
  it('treats blanks and dashes as zero', () => {
    expect(num('')).toBe(0);
    expect(num('-')).toBe(0);
    expect(num(null)).toBe(0);
  });
  it('handles decimals', () => {
    expect(num('12.5')).toBe(12.5);
  });
  it('returns 0 for junk rather than NaN', () => {
    expect(num('abc')).toBe(0);
  });
});

describe('parseMonthHeader', () => {
  it('parses the 2011+ installs header', () => {
    expect(parseMonthHeader('Jan 2011 - Installation Quantity')).toMatchObject({ year: 2011, monthIndex: 0, key: '2011-01' });
  });
  it('parses the historic plural variant', () => {
    expect(parseMonthHeader('Apr 2001 - Installations Quantity')).toMatchObject({ key: '2001-04' });
  });
  it('parses the capacity variant', () => {
    expect(parseMonthHeader('Dec 2025 - Rated Power Output in kW')).toMatchObject({ key: '2025-12' });
  });
  it('parses the battery kWh variant', () => {
    expect(parseMonthHeader('Jul 2025 - Usable capacity in kWh')).toMatchObject({ key: '2025-07' });
  });
  it('rejects total and historic lump columns', () => {
    expect(parseMonthHeader('Total Installation Quantity')).toBeNull();
    expect(parseMonthHeader('Historic Total Installation Quantity (2001 - 2010)')).toBeNull();
  });
  it('rejects an unknown month name', () => {
    expect(parseMonthHeader('Foo 2011 - Installation Quantity')).toBeNull();
  });
});

describe('normalisePostcode', () => {
  it('zero-pads short codes', () => {
    expect(normalisePostcode('800')).toBe('0800');
  });
  it('passes through 4-digit codes', () => {
    expect(normalisePostcode('3000')).toBe('3000');
  });
  it('rejects CER and ABS pseudo-codes', () => {
    expect(normalisePostcode('0000')).toBeNull();
    expect(normalisePostcode('9494')).toBeNull();
    expect(normalisePostcode('ZZZZ')).toBeNull();
  });
  it('rejects empty and overlong input', () => {
    expect(normalisePostcode('')).toBeNull();
    expect(normalisePostcode('12345')).toBeNull();
    expect(normalisePostcode(null)).toBeNull();
  });
});

describe('readWideTable', () => {
  const table = parseTable(
    'Small Unit Installation Postcode,Historic Total,Jan 2011 - Installation Quantity,Feb 2011 - Installation Quantity,Total Installation Quantity\n' +
      '2000,5,"1,200",3,1208\n' +
      '0000,1,1,1,3\n' +
      '3000,0,7,"2,000",2007',
  );

  it('indexes only real month columns', () => {
    const { monthKeys } = readWideTable(table);
    expect(monthKeys).toEqual(['2011-01', '2011-02']);
  });

  it('reads quoted thousands correctly', () => {
    const { byPostcode } = readWideTable(table);
    expect(byPostcode.get('2000')?.['2011-01']).toBe(1200);
    expect(byPostcode.get('3000')?.['2011-02']).toBe(2000);
  });

  it('drops pseudo-postcodes', () => {
    const { byPostcode } = readWideTable(table);
    expect(byPostcode.has('0000')).toBe(false);
  });

  it('omits zero months rather than storing them', () => {
    const { byPostcode } = readWideTable(table);
    expect(byPostcode.get('3000')?.['2011-01']).toBe(7);
    expect(Object.keys(byPostcode.get('2000') ?? {})).toEqual(['2011-01', '2011-02']);
  });
});

describe('mergeMonthKeys', () => {
  it('unions and sorts chronologically', () => {
    expect(mergeMonthKeys(['2011-02', '2001-04'], ['2011-02', '2026-05'])).toEqual(['2001-04', '2011-02', '2026-05']);
  });
});

describe('detectIncompleteMonths', () => {
  it('flags a single collapsed trailing month', () => {
    // Real shape: batteries steady ~40k, then May 2026 reports 8,992.
    const totals = [40000, 42000, 38000, 44000, 41000, 39000, 43000, 40000, 42000, 41000, 39000, 40000, 68000, 9000];
    expect(detectIncompleteMonths(totals)).toBe(1);
  });

  it('flags multiple trailing months when several are depressed', () => {
    const totals = [...Array(12).fill(1000), 300, 200];
    expect(detectIncompleteMonths(totals)).toBe(2);
  });

  it('always treats the final month as provisional even when it looks healthy', () => {
    const totals = [...Array(12).fill(1000), 1000];
    expect(detectIncompleteMonths(totals)).toBe(1);
  });

  it('never flags more than the cap', () => {
    const totals = [...Array(12).fill(1000), ...Array(20).fill(1)];
    expect(detectIncompleteMonths(totals)).toBeLessThanOrEqual(12);
  });

  it('handles short and empty series without throwing', () => {
    expect(detectIncompleteMonths([])).toBe(0);
    expect(detectIncompleteMonths([5])).toBe(1);
    expect(detectIncompleteMonths([5, 5, 5])).toBe(1);
  });
});

describe('pickPrimaryLocality', () => {
  // A postcode covers many suburbs and none is marked primary, so alphabetical
  // order labelled 4670 "Abbotsford" when everyone calls it Bundaberg.
  it('prefers the locality matching the SA3 over the alphabetically first', () => {
    expect(pickPrimaryLocality(['Abbotsford', 'Bundaberg', 'Kepnock'], 'Bundaberg', 'Bundaberg Regional')).toBe('Bundaberg');
  });

  it('uses a shared stem as the town name when no bare suburb carries it', () => {
    // Real 4670: the SA3 is "Burnett", which would wrongly pick "Burnett Downs".
    expect(
      pickPrimaryLocality(
        ['Abbotsford', 'Burnett Downs', 'Bundaberg Central', 'Bundaberg East', 'Bundaberg North', 'Bundaberg South'],
        'Burnett',
        '',
      ),
    ).toBe('Bundaberg');
  });

  it('prefers a bare suburb over the stem when one exists', () => {
    expect(pickPrimaryLocality(['Melbourne', 'Melbourne Cbd', 'Melbourne City', 'Melbourne Docklands'], 'Melbourne', 'Melbourne')).toBe(
      'Melbourne',
    );
  });

  it('ignores a stem shared by only two suburbs', () => {
    expect(pickPrimaryLocality(['Zeta Park', 'Zeta Hill', 'Toowoomba'], 'Toowoomba', '')).toBe('Toowoomba');
  });

  it('matches an LGA when the SA3 does not help', () => {
    expect(pickPrimaryLocality(['Athol', 'Toowoomba'], '', 'Toowoomba Regional')).toBe('Toowoomba');
  });

  it('matches a multi-word SA3 name', () => {
    expect(pickPrimaryLocality(['Booral', 'Hervey Bay', 'Urraween'], 'Hervey Bay', '')).toBe('Hervey Bay');
  });

  it('matches a suburb that extends the SA3 name', () => {
    expect(pickPrimaryLocality(['Ashby', 'Wanneroo North'], 'Wanneroo', '')).toBe('Wanneroo North');
  });

  it('prefers the shorter name when several match equally', () => {
    expect(pickPrimaryLocality(['Bundaberg South', 'Bundaberg'], 'Bundaberg', '')).toBe('Bundaberg');
  });

  it('ignores decorations like "(City)" and "Regional" when matching', () => {
    expect(pickPrimaryLocality(['Zebra', 'Mandurah'], 'Mandurah (City)', '')).toBe('Mandurah');
  });

  it('falls back to alphabetical when nothing matches', () => {
    expect(pickPrimaryLocality(['Zebra', 'Apple'], 'Nowhere', 'Nowhere')).toBe('Apple');
  });

  it('returns empty string for no localities', () => {
    expect(pickPrimaryLocality([], 'X', 'Y')).toBe('');
  });

  it('handles a single locality', () => {
    expect(pickPrimaryLocality(['Solo'], '', '')).toBe('Solo');
  });
});

describe('linearFit (pipeline copy)', () => {
  it('recovers a known line exactly', () => {
    const fit = linearFit([
      { x: 0, y: 1 },
      { x: 1, y: 3 },
      { x: 2, y: 5 },
    ]);
    expect(fit.slope).toBeCloseTo(2);
    expect(fit.intercept).toBeCloseTo(1);
    expect(fit.r).toBeCloseTo(1);
  });

  it('returns null for degenerate input', () => {
    expect(linearFit([])).toBeNull();
    expect(linearFit([{ x: 1, y: 1 }])).toBeNull();
    expect(
      linearFit([
        { x: 2, y: 1 },
        { x: 2, y: 5 },
      ]),
    ).toBeNull();
  });
});
