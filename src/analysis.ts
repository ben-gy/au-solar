// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * Pure analysis functions. No DOM, no fetch — all unit tested.
 */
import type { Postcode } from './types';
import { GROWTH_CORRIDOR_PER100, MIN_DWELLINGS } from './data';

export interface Point {
  x: number;
  y: number;
}

export interface Fit {
  slope: number;
  intercept: number;
  r: number;
  r2: number;
  n: number;
}

/** Ordinary least squares + Pearson correlation. */
export function linearFit(points: Point[]): Fit | null {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = pts.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const { x, y } of pts) {
    sx += x;
    sy += y;
    sxy += x * y;
    sxx += x * x;
    syy += y * y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  const rDenom = Math.sqrt(denom * (n * syy - sy * sy));
  const r = rDenom === 0 ? 0 : (n * sxy - sx * sy) / rDenom;
  return { slope, intercept, r, r2: r * r, n };
}

export function median(values: number[]): number {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function quantile(values: number[], q: number): number {
  const v = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const pos = (v.length - 1) * Math.min(Math.max(q, 0), 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return v[lo];
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** Postcodes eligible for ranking: real denominator, not a handful of homes. Unordered. */
export function rankable(all: Postcode[]): Postcode[] {
  return all.filter((p) => p.per100 != null && p.dw >= MIN_DWELLINGS);
}

/**
 * Rankable postcodes ordered best-to-worst by solar penetration.
 *
 * Always use this (never bare `rankable`) when reporting a position: ranking
 * against the unsorted filter once reported #1603 for the highest-uptake
 * postcode in the country.
 */
export function rankedByPer100(all: Postcode[]): Postcode[] {
  return rankable(all).sort((a, b) => (b.per100 as number) - (a.per100 as number));
}

export interface Bin {
  from: number;
  to: number;
  count: number;
  items: Postcode[];
}

/** Equal-width histogram binning. Values at/above `max` land in the final bin. */
export function histogram(items: Postcode[], value: (p: Postcode) => number | null, binCount: number, max: number): Bin[] {
  const width = max / binCount;
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => ({
    from: i * width,
    to: (i + 1) * width,
    count: 0,
    items: [],
  }));
  for (const p of items) {
    const v = value(p);
    if (v == null || !Number.isFinite(v)) continue;
    let idx = Math.floor(v / width);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].count++;
    bins[idx].items.push(p);
  }
  return bins;
}

export type Severity = 'info' | 'warn' | 'alert' | 'good';

export interface Insight {
  severity: Severity;
  title: string;
  body: string;
  postcodes: string[];
}

export interface InsightInput {
  all: Postcode[];
  nationalPer100: number;
  battTotal: number;
  battMonths: number;
}

/** Auto-detected findings, ordered most striking first. */
export function buildInsights({ all, nationalPer100, battTotal, battMonths }: InsightInput): Insight[] {
  const out: Insight[] = [];
  const rated = rankable(all);
  if (rated.length === 0) return out;

  const sorted = rated.slice().sort((a, b) => (b.per100 as number) - (a.per100 as number));
  const withShare = rated.filter((p) => p.ownerSepShare != null);

  // 1. The headline divide: top vs bottom.
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (top && bottom && bottom.per100! > 0) {
    const ratio = Math.round(top.per100! / bottom.per100!);
    out.push({
      severity: 'alert',
      title: `Australia's solar gap is ${ratio.toLocaleString()}× wide`,
      body:
        `${top.pc} (${top.loc || top.st}) has ${top.per100!.toFixed(1)} systems per 100 homes. ` +
        `${bottom.pc} (${bottom.loc || bottom.st}) has ${bottom.per100!.toFixed(1)} — where ` +
        `${bottom.flatShare?.toFixed(0) ?? '—'}% of homes are apartments. Same subsidy, same sun.`,
      postcodes: [top.pc, bottom.pc],
    });
  }

  // 2. Ownership explains most of the variation.
  const fit = linearFit(withShare.map((p) => ({ x: p.ownerSepShare as number, y: p.per100 as number })));
  if (fit && fit.n > 50) {
    out.push({
      severity: 'info',
      title: `Who owns the roof explains ${Math.round(fit.r2 * 100)}% of the difference`,
      body:
        `Across ${fit.n.toLocaleString()} postcodes, the share of homes that are owner-occupied detached houses ` +
        `correlates with solar uptake at r = ${fit.r.toFixed(2)} (R² = ${fit.r2.toFixed(2)}). Every ` +
        `10 percentage points more owner-occupied houses is worth about ` +
        `${(fit.slope * 10).toFixed(1)} more systems per 100 homes.`,
      postcodes: [],
    });
  }

  // 3. Renter-heavy postcodes left behind.
  const renterHeavy = rated
    .filter((p) => (p.rentShare ?? 0) >= 50 && p.per100 != null)
    .sort((a, b) => (a.per100 as number) - (b.per100 as number));
  if (renterHeavy.length >= 5) {
    const med = median(renterHeavy.map((p) => p.per100 as number));
    out.push({
      severity: 'warn',
      title: `Renter-majority postcodes sit at ${med.toFixed(1)} systems per 100 homes`,
      body:
        `${renterHeavy.length.toLocaleString()} postcodes are majority-rented. Their median uptake is ` +
        `${med.toFixed(1)} per 100 versus ${nationalPer100.toFixed(1)} nationally — ` +
        `${(nationalPer100 / Math.max(med, 0.1)).toFixed(1)}× lower. The split incentive at work.`,
      postcodes: renterHeavy.slice(0, 4).map((p) => p.pc),
    });
  }

  // 4. Apartment postcodes are effectively excluded.
  const flatHeavy = rated.filter((p) => (p.flatShare ?? 0) >= 60);
  if (flatHeavy.length >= 3) {
    const med = median(flatHeavy.map((p) => p.per100 as number));
    out.push({
      severity: 'warn',
      title: `Apartment postcodes average ${med.toFixed(1)} systems per 100 homes`,
      body:
        `In the ${flatHeavy.length} postcodes where 60%+ of homes are apartments, rooftop solar is close to ` +
        `absent — the roof is shared common property, so no single household can install.`,
      postcodes: flatHeavy
        .slice()
        .sort((a, b) => (a.per100 as number) - (b.per100 as number))
        .slice(0, 4)
        .map((p) => p.pc),
    });
  }

  // 5. The battery surge.
  if (battTotal > 0 && battMonths > 0) {
    const battLeaders = rated
      .filter((p) => p.batPer100 != null)
      .sort((a, b) => (b.batPer100 as number) - (a.batPer100 as number))
      .slice(0, 4);
    out.push({
      severity: 'good',
      title: `${battTotal.toLocaleString()} home batteries in ${battMonths} months`,
      body:
        `Before July 2025 the SRES recorded virtually no home batteries. Since the Cheaper Home Batteries ` +
        `rebate began, Australians have installed ${battTotal.toLocaleString()} — about ` +
        `${Math.round(battTotal / battMonths).toLocaleString()} a month, from a standing start.`,
      postcodes: battLeaders.map((p) => p.pc),
    });
  }

  // 6. Growth-corridor data-quality flag.
  const growth = rated.filter((p) => (p.per100 as number) >= GROWTH_CORRIDOR_PER100);
  if (growth.length > 0) {
    out.push({
      severity: 'info',
      title: `${growth.length} postcodes report more systems than 2021 homes`,
      body:
        `Impossible on its face, and it has two causes. Most are growth corridors, where thousands of houses ` +
        `have gone up since the Census, so the installs are current but the home count is not. The rest are ` +
        `small rural and industrial postcodes, where farm sheds and business rooftops carry systems no ` +
        `household lives under. Treat these ratios as an upper bound.`,
      postcodes: growth.slice(0, 4).map((p) => p.pc),
    });
  }

  // 7. Biggest system sizes.
  const bigSystems = rated.filter((p) => p.avgKw != null && p.solar >= 500).sort((a, b) => (b.avgKw as number) - (a.avgKw as number));
  if (bigSystems.length >= 3) {
    const p = bigSystems[0];
    out.push({
      severity: 'info',
      title: `Biggest average systems: ${p.pc} at ${p.avgKw!.toFixed(1)} kW`,
      body:
        `${p.loc || p.pc} averages ${p.avgKw!.toFixed(1)} kW across ${p.solar.toLocaleString()} systems — far ` +
        `above any house. The scheme covers commercial systems up to 100 kW, so industrial and rural postcodes ` +
        `sit at the top here. Among homes, size tracks when a postcode adopted: 1.5–3 kW in the early 2010s, ` +
        `10 kW+ today.`,
      postcodes: bigSystems.slice(0, 4).map((x) => x.pc),
    });
  }

  return out;
}

/** State-level rollup used by the batteries and rankings views. */
export interface StateAgg {
  state: string;
  solar: number;
  battery: number;
  dwellings: number;
  per100: number;
  batPer100: number;
  kw: number;
}

export function aggregateByState(all: Postcode[]): StateAgg[] {
  const map = new Map<string, StateAgg>();
  for (const p of all) {
    if (!p.st) continue;
    let rec = map.get(p.st);
    if (!rec) {
      rec = { state: p.st, solar: 0, battery: 0, dwellings: 0, per100: 0, batPer100: 0, kw: 0 };
      map.set(p.st, rec);
    }
    rec.solar += p.solar;
    rec.battery += p.bat;
    rec.dwellings += p.dw;
    rec.kw += p.kw;
  }
  for (const rec of map.values()) {
    rec.per100 = rec.dwellings > 0 ? (rec.solar / rec.dwellings) * 100 : 0;
    rec.batPer100 = rec.dwellings > 0 ? (rec.battery / rec.dwellings) * 100 : 0;
  }
  return [...map.values()].sort((a, b) => b.per100 - a.per100);
}
