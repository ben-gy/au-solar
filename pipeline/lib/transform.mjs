/**
 * Pure transform helpers shared by the pipeline and covered by unit tests.
 */
import { num } from './csv.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Column headers differ across the CER files:
 *   "Jan 2011 - Installation Quantity"   (solar installs, 2011+)
 *   "Apr 2001 - Installations Quantity"  (solar installs, historic — note plural)
 *   "Jan 2011 - Rated Power Output in kW"(solar capacity)
 *   "Jul 2025 - Usable capacity in kWh"  (battery capacity)
 * So match the "<Mon> <YYYY>" prefix generically rather than the metric suffix.
 */
export function parseMonthHeader(header) {
  const m = /^([A-Z][a-z]{2})\s+(\d{4})\s*-/.exec(header.trim());
  if (!m) return null;
  const monthIndex = MONTHS.indexOf(m[1]);
  if (monthIndex < 0) return null;
  return { year: Number(m[2]), monthIndex, key: `${m[2]}-${String(monthIndex + 1).padStart(2, '0')}` };
}

/** Normalise a postcode to a 4-char zero-padded string, or null if not a real postcode. */
export function normalisePostcode(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,4}$/.test(s)) return null;
  const pc = s.padStart(4, '0');
  // 0000 is a CER placeholder; ABS pseudo-codes carry no geography.
  if (pc === '0000' || pc === '9494' || pc === '9797') return null;
  return pc;
}

/**
 * Build {postcode -> {monthKey -> value}} plus the ordered month key list from a
 * wide CER table. Totals/historic lump columns are ignored here.
 */
export function readWideTable({ header, rows }) {
  const monthCols = [];
  header.forEach((h, i) => {
    const parsed = parseMonthHeader(h);
    if (parsed) monthCols.push({ index: i, key: parsed.key });
  });
  const byPostcode = new Map();
  for (const row of rows) {
    const pc = normalisePostcode(row[0]);
    if (!pc) continue;
    let rec = byPostcode.get(pc);
    if (!rec) {
      rec = {};
      byPostcode.set(pc, rec);
    }
    for (const { index, key } of monthCols) {
      const v = num(row[index]);
      if (v !== 0) rec[key] = (rec[key] || 0) + v;
    }
  }
  return { byPostcode, monthKeys: monthCols.map((c) => c.key) };
}

/** Chronologically sorted union of month keys. */
export function mergeMonthKeys(...lists) {
  return [...new Set(lists.flat())].sort();
}

/**
 * Identify trailing months that are still being reported.
 *
 * Small-scale technology certificates may be created up to 12 months after the
 * installation date, so the most recent months in every CER release are
 * under-reported and revise upward later. Presenting them as a real collapse
 * would be a lie: May 2026 shows 8,992 batteries against April's 68,598.
 *
 * Walk backwards while a month sits below `threshold` x the median of the 12
 * months before it. The final month is always provisional — it is the "as at"
 * cut-off and is definitionally partial.
 */
export function detectIncompleteMonths(totals, { threshold = 0.8, maxFlagged = 12 } = {}) {
  if (totals.length === 0) return 0;
  if (totals.length < 4) return 1;
  let flagged = 0;
  for (let i = totals.length - 1; i >= 1 && flagged < maxFlagged; i--) {
    const windowStart = Math.max(0, i - 12);
    const window = totals.slice(windowStart, i).filter((v) => v > 0);
    if (window.length === 0) break;
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0 && totals[i] < median * threshold) flagged++;
    else break;
  }
  return Math.max(1, flagged);
}

/** Least-squares fit + Pearson r for the Solar Divide scatter. */
export function linearFit(points) {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
  for (const { x, y } of pts) {
    sx += x; sy += y; sxy += x * y; sxx += x * x; syy += y * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const rDenom = Math.sqrt(denom * (n * syy - sy * sy));
  const r = rDenom === 0 ? 0 : (n * sxy - sx * sy) / rDenom;
  return { slope, intercept, r, r2: r * r, n };
}

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export { MONTHS };
