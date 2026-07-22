// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
export interface Postcode {
  pc: string;
  loc: string;
  locs: string[];
  st: string;
  lat: number | null;
  lng: number | null;
  sa4: string;
  lga: string;
  /** Occupied private dwellings, ABS Census 2021 (table G37). */
  dw: number;
  solar: number;
  kw: number;
  bat: number;
  kwh: number;
  /** Solar systems per 100 occupied private dwellings. Null when dwellings are unknown. */
  per100: number | null;
  batPer100: number | null;
  avgKw: number | null;
  /** Share of dwellings that are owner-occupied separate houses — the cohort that controls a roof. */
  ownerSepShare: number | null;
  rentShare: number | null;
  flatShare: number | null;
  sepHouse: number;
  flatCount: number;
  ownOut: number;
  ownMtg: number;
  rented: number;
  /** Installs per calendar year, aligned to meta.years. */
  yr: number[];
}

export interface Meta {
  generated: string;
  solarMonths: string[];
  battMonths: string[];
  years: number[];
  solarProvisional: number;
  battProvisional: number;
  latestSolarMonth: string;
  latestCompleteSolarMonth: string;
  latestBattMonth: string;
  latestCompleteBattMonth: string;
  national: {
    solar: number;
    battery: number;
    kw: number;
    kwh: number;
    dwellings: number;
    per100: number;
    batPer100: number;
    medianPer100: number;
    postcodes: number;
    mappable: number;
  };
  sources: Record<string, string>;
}

export interface Series {
  solarMonths: string[];
  battMonths: string[];
  national: { s: number[]; b: number[] };
  states: Record<string, { solar: number[]; battery: number[] }>;
  postcodes: Record<string, { s: number[]; b: number[] }>;
}

export type ViewId =
  | 'map'
  | 'rankings'
  | 'explorer'
  | 'divide'
  | 'batteries'
  | 'timeline'
  | 'distribution'
  | 'insights';
