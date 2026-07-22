// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { Meta, Postcode, Series } from './types';

/**
 * Postcodes at or above this many systems per 100 dwellings are almost always
 * greenfield growth corridors: the denominator is the 2021 census dwelling
 * count, but thousands of homes have been built there since. Flagged in the UI
 * rather than hidden — the effect is real, the ratio is just overstated.
 */
export const GROWTH_CORRIDOR_PER100 = 100;

/** Minimum dwellings for a postcode to be ranked, so tiny postcodes don't win on noise. */
export const MIN_DWELLINGS = 200;

export const STATE_COLOURS: Record<string, string> = {
  NSW: '#0ea5e9',
  VIC: '#6366f1',
  QLD: '#f59e0b',
  SA: '#ef4444',
  WA: '#14b8a6',
  TAS: '#84cc16',
  NT: '#f97316',
  ACT: '#a855f7',
};

export const STATE_ORDER = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

export function stateColour(st: string): string {
  return STATE_COLOURS[st] ?? '#94a3b8';
}

export interface Dataset {
  postcodes: Postcode[];
  meta: Meta;
  byPostcode: Map<string, Postcode>;
  /** Postcodes with a usable denominator, ranked by penetration desc. */
  ranked: Postcode[];
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  const [postcodes, meta] = await Promise.all([
    fetchJson<Postcode[]>('data/postcodes.json', signal),
    fetchJson<Meta>('data/meta.json', signal),
  ]);
  const byPostcode = new Map(postcodes.map((p) => [p.pc, p]));
  const { rankedByPer100 } = await import('./analysis');
  return { postcodes, meta, byPostcode, ranked: rankedByPer100(postcodes) };
}

let seriesPromise: Promise<Series> | null = null;
/** Monthly detail is ~2 MB — only fetched when a view or drill-down needs it. */
export function loadSeries(signal?: AbortSignal): Promise<Series> {
  if (!seriesPromise) {
    seriesPromise = fetchJson<Series>('data/series.json', signal).catch((err) => {
      seriesPromise = null;
      throw err;
    });
  }
  return seriesPromise;
}

let geoPromise: Promise<GeoJSON.FeatureCollection> | null = null;
export function loadGeo(signal?: AbortSignal): Promise<GeoJSON.FeatureCollection> {
  if (!geoPromise) {
    geoPromise = fetchJson<GeoJSON.FeatureCollection>('data/poa.geojson', signal).catch((err) => {
      geoPromise = null;
      throw err;
    });
  }
  return geoPromise;
}

export function isGrowthCorridor(p: Postcode): boolean {
  return p.per100 != null && p.per100 >= GROWTH_CORRIDOR_PER100;
}

/** Search postcodes by code or locality name. */
export function searchPostcodes(all: Postcode[], query: string, limit = 8): Postcode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ p: Postcode; score: number }> = [];
  for (const p of all) {
    let score = -1;
    if (p.pc === q) score = 100;
    else if (p.pc.startsWith(q)) score = 80;
    else {
      const hit = p.locs.find((l) => l.toLowerCase().startsWith(q));
      if (hit) score = 60 - hit.length * 0.01;
      else if (p.locs.some((l) => l.toLowerCase().includes(q))) score = 30;
    }
    if (score > 0) scored.push({ p, score: score + Math.min(p.dw, 5000) / 100000 });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.p);
}
