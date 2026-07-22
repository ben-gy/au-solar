#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/**
 * aggregate.mjs — join CER installs to ABS census dwellings, emit public/data/.
 *
 * Outputs:
 *   public/data/postcodes.json — one summary record per postcode (+ yearly sparkline)
 *   public/data/series.json    — national/state/per-postcode monthly series (lazy-loaded)
 *   public/data/meta.json      — months, totals, provenance, headline stats
 *   public/data/poa.geojson    — simplified ABS postal-area boundaries
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTable, num } from './lib/csv.mjs';
import {
  readWideTable,
  mergeMonthKeys,
  detectIncompleteMonths,
  normalisePostcode,
  median,
} from './lib/transform.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'pipeline', '.cache');
const OUT = path.join(ROOT, 'public', 'data');

const log = (m) => process.stdout.write(`[aggregate] ${m}\n`);
const read = (f) => fs.readFileSync(path.join(CACHE, f), 'utf8');

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

/** Fallback state derivation for postcodes missing from the reference file. */
function stateFromPostcode(pc) {
  const n = Number(pc);
  if (n >= 200 && n <= 299) return 'ACT';
  if (n >= 2600 && n <= 2618) return 'ACT';
  if (n >= 2900 && n <= 2920) return 'ACT';
  if (n >= 1000 && n <= 2599) return 'NSW';
  if (n >= 2619 && n <= 2899) return 'NSW';
  if (n >= 2921 && n <= 2999) return 'NSW';
  if (n >= 800 && n <= 999) return 'NT';
  if (n >= 3000 && n <= 3999) return 'VIC';
  if (n >= 8000 && n <= 8999) return 'VIC';
  if (n >= 4000 && n <= 4999) return 'QLD';
  if (n >= 9000 && n <= 9999) return 'QLD';
  if (n >= 5000 && n <= 5999) return 'SA';
  if (n >= 6000 && n <= 6999) return 'WA';
  if (n >= 7000 && n <= 7999) return 'TAS';
  return null;
}

function loadPostcodeRef() {
  const { header, rows } = parseTable(read('postcodes_ref.csv'));
  const col = (name) => header.indexOf(name);
  const iPc = col('postcode');
  const iLoc = col('locality');
  const iState = col('state');
  const iLat = col('lat');
  const iLng = col('long');
  const iSa3 = col('sa3name');
  const iSa4 = col('sa4name');
  const iLga = col('lgaregion');

  const map = new Map();
  for (const r of rows) {
    const pc = normalisePostcode(r[iPc]);
    if (!pc) continue;
    // Skip PO-box / non-delivery rows that carry no real coordinates.
    const lat = num(r[iLat]);
    const lng = num(r[iLng]);
    let rec = map.get(pc);
    if (!rec) {
      rec = { localities: new Set(), state: null, lat: 0, lng: 0, sa3: '', sa4: '', lga: '', n: 0 };
      map.set(pc, rec);
    }
    const loc = (r[iLoc] || '').trim();
    if (loc) rec.localities.add(toTitle(loc));
    if (!rec.state && STATES.includes((r[iState] || '').trim())) rec.state = r[iState].trim();
    if (lat !== 0 && lng !== 0) {
      rec.lat += lat;
      rec.lng += lng;
      rec.n++;
    }
    if (!rec.sa3 && r[iSa3]) rec.sa3 = r[iSa3].trim();
    if (!rec.sa4 && r[iSa4]) rec.sa4 = r[iSa4].trim();
    if (!rec.lga && r[iLga]) rec.lga = r[iLga].trim();
  }
  for (const rec of map.values()) {
    if (rec.n > 0) {
      rec.lat /= rec.n;
      rec.lng /= rec.n;
    }
  }
  return map;
}

function toTitle(s) {
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\b(Bc|Dc|Mc|Po)\b/g, (m) => m.toUpperCase());
}

/**
 * Pick the locality a human would recognise for a postcode.
 *
 * A postcode covers many suburbs and the source marks none of them primary, so
 * taking the alphabetically-first one labels 4670 "Abbotsford" when everyone
 * calls it Bundaberg, and 4350 "Athol" when it is Toowoomba.
 *
 * Two signals, in order:
 *  1. A shared stem. 4670 holds Bundaberg Central/East/North/South/West — when
 *     several suburbs share a leading word, that word IS the town's name. This
 *     beats the statistical area, whose SA3 for 4670 is the unhelpful "Burnett".
 *  2. The SA3 / LGA name, which is usually the town the postcode centres on
 *     (Toowoomba, Mandurah, Mackay).
 * Alphabetical order is the last resort.
 */
export function pickPrimaryLocality(localities, sa3 = '', lga = '') {
  const names = [...localities].filter(Boolean).sort();
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];

  // 1. Shared stem across three or more suburbs.
  const STEM_MIN = 3;
  const stems = new Map();
  for (const n of names) {
    const first = n.split(/\s+/)[0];
    if (!first || first.length < 4) continue;
    stems.set(first, (stems.get(first) || 0) + 1);
  }
  let bestStem = '';
  let bestStemCount = 0;
  for (const [stem, count] of stems) {
    if (count > bestStemCount || (count === bestStemCount && stem.length < bestStem.length)) {
      bestStem = stem;
      bestStemCount = count;
    }
  }
  if (bestStemCount >= STEM_MIN) {
    // Prefer a suburb that IS the bare stem ("Melbourne"); otherwise use the
    // stem itself ("Bundaberg"), which is what a local would actually say.
    const bare = names.find((n) => n === bestStem);
    return bare ?? bestStem;
  }

  const clean = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\s*\(.*?\)\s*/g, ' ')
      .replace(/\b(city|regional|shire|council|rural|central|area|district)\b/g, ' ')
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const sa3c = clean(sa3);
  const lgac = clean(lga);

  const score = (name) => {
    const n = clean(name);
    if (!n) return 0;
    if (sa3c && n === sa3c) return 100;
    if (lgac && n === lgac) return 90;
    if (sa3c && (sa3c.startsWith(`${n} `) || sa3c.endsWith(` ${n}`) || sa3c === n)) return 80;
    if (sa3c && (n.startsWith(`${sa3c} `) || n.endsWith(` ${sa3c}`))) return 70;
    if (lgac && (lgac.startsWith(`${n} `) || lgac.endsWith(` ${n}`))) return 60;
    if (lgac && (n.startsWith(`${lgac} `) || n.endsWith(` ${lgac}`))) return 50;
    return 0;
  };

  let best = names[0];
  let bestScore = -1;
  for (const n of names) {
    const s = score(n);
    // Ties break toward the shorter, plainer name ("Bundaberg" over "Bundaberg South").
    if (s > bestScore || (s === bestScore && s > 0 && n.length < best.length)) {
      best = n;
      bestScore = s;
    }
  }
  return best;
}

/** ABS Census G37: occupied private dwellings by tenure x dwelling structure. */
function loadDwellings() {
  const { header, rows } = parseTable(read('G37_POA.csv'));
  const idx = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`G37 is missing expected column "${name}" — ABS changed the schema.`);
    return i;
  };
  const cols = {
    code: idx('POA_CODE_2021'),
    ownOutTotal: idx('O_OR_Total'),
    ownMtgTotal: idx('O_MTG_Total'),
    rentTotal: idx('R_Tot_Total'),
    ownOutSep: idx('O_OR_DS_Sep_house'),
    ownMtgSep: idx('O_MTG_DS_Sep_house'),
    sepHouse: idx('Total_DS_Sep_house'),
    semiDet: idx('Total_DS_SemiD_ro_or_tce_h_th'),
    flat: idx('Total_DS_Flat_apart'),
    othDwell: idx('Total_DS_Oth_dwell'),
    total: idx('Total_Total'),
  };

  const map = new Map();
  for (const r of rows) {
    const pc = normalisePostcode(String(r[cols.code]).replace(/^POA/, ''));
    if (!pc) continue;
    const total = num(r[cols.total]);
    if (total <= 0) continue;
    map.set(pc, {
      dwellings: total,
      ownedOutright: num(r[cols.ownOutTotal]),
      ownedMortgage: num(r[cols.ownMtgTotal]),
      rented: num(r[cols.rentTotal]),
      sepHouse: num(r[cols.sepHouse]),
      semiDetached: num(r[cols.semiDet]),
      flat: num(r[cols.flat]),
      otherDwelling: num(r[cols.othDwell]),
      // The cohort that can actually put panels on a roof it controls.
      ownerSepHouse: num(r[cols.ownOutSep]) + num(r[cols.ownMtgSep]),
    });
  }
  return map;
}

function sumSeries(byPostcode, monthKeys) {
  return monthKeys.map((k) => {
    let t = 0;
    for (const rec of byPostcode.values()) t += rec[k] || 0;
    return t;
  });
}

function round(n, dp = 1) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  log('parsing CER tables (RFC4180 parser — naive split corrupts 38% of rows)');
  const solarNow = readWideTable(parseTable(read('solarInstalls.csv')));
  const solarHist = readWideTable(parseTable(read('solarInstallsHistoric.csv')));
  const solarCap = readWideTable(parseTable(read('solarCapacity.csv')));
  const batt = readWideTable(parseTable(read('batteryInstalls.csv')));
  const battCap = readWideTable(parseTable(read('batteryCapacity.csv')));

  const solarMonths = mergeMonthKeys(solarHist.monthKeys, solarNow.monthKeys);
  const battMonths = mergeMonthKeys(batt.monthKeys);
  log(`solar months: ${solarMonths.length} (${solarMonths[0]} -> ${solarMonths.at(-1)})`);
  log(`battery months: ${battMonths.length} (${battMonths[0]} -> ${battMonths.at(-1)})`);

  // Merge the historic (2001-2010) and current (2011+) solar install tables.
  const solarAll = new Map();
  for (const src of [solarHist.byPostcode, solarNow.byPostcode]) {
    for (const [pc, rec] of src) {
      const target = solarAll.get(pc) || {};
      for (const [k, v] of Object.entries(rec)) target[k] = (target[k] || 0) + v;
      solarAll.set(pc, target);
    }
  }

  const dwellings = loadDwellings();
  const ref = loadPostcodeRef();
  log(`census postcodes with dwellings: ${dwellings.size}`);

  // National monthly series + provisional-month detection.
  const solarNational = sumSeries(solarAll, solarMonths);
  const battNational = sumSeries(batt.byPostcode, battMonths);
  const solarProvisional = detectIncompleteMonths(solarNational);
  const battProvisional = detectIncompleteMonths(battNational);
  log(`provisional trailing months — solar: ${solarProvisional}, battery: ${battProvisional}`);

  // Per-state monthly series.
  const stateSeries = {};
  for (const s of STATES) stateSeries[s] = { solar: solarMonths.map(() => 0), battery: battMonths.map(() => 0) };

  const allPostcodes = new Set([...solarAll.keys(), ...batt.byPostcode.keys(), ...dwellings.keys()]);
  const records = [];
  const seriesOut = {};

  for (const pc of [...allPostcodes].sort()) {
    const solarRec = solarAll.get(pc) || {};
    const battRec = batt.byPostcode.get(pc) || {};
    const capRec = solarCap.byPostcode.get(pc) || {};
    const battCapRec = battCap.byPostcode.get(pc) || {};
    const dw = dwellings.get(pc);
    const meta = ref.get(pc);

    const solarMonthly = solarMonths.map((k) => solarRec[k] || 0);
    const battMonthly = battMonths.map((k) => battRec[k] || 0);
    const solarTotal = solarMonthly.reduce((a, b) => a + b, 0);
    const battTotal = battMonthly.reduce((a, b) => a + b, 0);
    const kwTotal = Object.values(capRec).reduce((a, b) => a + b, 0);
    const kwhTotal = Object.values(battCapRec).reduce((a, b) => a + b, 0);

    // Drop postcodes with no installs and no dwellings — pure noise.
    if (solarTotal === 0 && battTotal === 0 && !dw) continue;

    const state = meta?.state || stateFromPostcode(pc);
    if (state) {
      solarMonthly.forEach((v, i) => (stateSeries[state].solar[i] += v));
      battMonthly.forEach((v, i) => (stateSeries[state].battery[i] += v));
    }

    // Yearly sparkline (installs per calendar year).
    const yearly = new Map();
    solarMonths.forEach((k, i) => {
      const y = Number(k.slice(0, 4));
      yearly.set(y, (yearly.get(y) || 0) + solarMonthly[i]);
    });

    const dwCount = dw?.dwellings ?? 0;
    const per100 = dwCount > 0 ? (solarTotal / dwCount) * 100 : null;
    const battPer100 = dwCount > 0 ? (battTotal / dwCount) * 100 : null;
    const ownerSepShare = dwCount > 0 ? (dw.ownerSepHouse / dwCount) * 100 : null;
    const rentShare = dwCount > 0 ? (dw.rented / dwCount) * 100 : null;
    const flatShare = dwCount > 0 ? (dw.flat / dwCount) * 100 : null;

    const localities = meta?.localities?.size ? [...meta.localities].sort() : [];
    const primary = pickPrimaryLocality(localities, meta?.sa3 || meta?.sa4 || '', meta?.lga || '');

    records.push({
      pc,
      loc: primary,
      // Keep the primary first so the drawer and tooltips lead with it.
      locs: [primary, ...localities.filter((l) => l !== primary)].filter(Boolean).slice(0, 12),
      st: state || '',
      lat: meta?.n ? round(meta.lat, 4) : null,
      lng: meta?.n ? round(meta.lng, 4) : null,
      sa4: meta?.sa4 || '',
      lga: meta?.lga || '',
      dw: dwCount,
      solar: solarTotal,
      kw: Math.round(kwTotal),
      bat: battTotal,
      kwh: Math.round(kwhTotal),
      per100: per100 === null ? null : round(per100, 1),
      batPer100: battPer100 === null ? null : round(battPer100, 2),
      avgKw: solarTotal > 0 ? round(kwTotal / solarTotal, 2) : null,
      ownerSepShare: ownerSepShare === null ? null : round(ownerSepShare, 1),
      rentShare: rentShare === null ? null : round(rentShare, 1),
      flatShare: flatShare === null ? null : round(flatShare, 1),
      sepHouse: dw?.sepHouse ?? 0,
      flatCount: dw?.flat ?? 0,
      ownOut: dw?.ownedOutright ?? 0,
      ownMtg: dw?.ownedMortgage ?? 0,
      rented: dw?.rented ?? 0,
      yr: [...yearly.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v),
    });

    seriesOut[pc] = { s: solarMonthly, b: battMonthly };
  }

  const years = [...new Set(solarMonths.map((k) => Number(k.slice(0, 4))))].sort();

  // Headline national numbers.
  const totalSolar = records.reduce((a, r) => a + r.solar, 0);
  const totalBatt = records.reduce((a, r) => a + r.bat, 0);
  const totalKw = records.reduce((a, r) => a + r.kw, 0);
  const totalKwh = records.reduce((a, r) => a + r.kwh, 0);
  const totalDw = records.reduce((a, r) => a + r.dw, 0);
  const rated = records.filter((r) => r.per100 !== null && r.dw >= 200);

  const meta = {
    generated: new Date().toISOString(),
    solarMonths,
    battMonths,
    years,
    solarProvisional,
    battProvisional,
    latestSolarMonth: solarMonths.at(-1),
    latestCompleteSolarMonth: solarMonths[solarMonths.length - 1 - solarProvisional],
    latestBattMonth: battMonths.at(-1),
    latestCompleteBattMonth: battMonths[battMonths.length - 1 - battProvisional],
    national: {
      solar: totalSolar,
      battery: totalBatt,
      kw: totalKw,
      kwh: totalKwh,
      dwellings: totalDw,
      per100: round((totalSolar / totalDw) * 100, 1),
      batPer100: round((totalBatt / totalDw) * 100, 2),
      medianPer100: round(median(rated.map((r) => r.per100)), 1),
      postcodes: records.length,
      mappable: records.filter((r) => r.dw > 0).length,
    },
    sources: {
      cer: 'https://cer.gov.au/markets/reports-and-data/small-scale-installation-postcode-data',
      census: 'https://www.abs.gov.au/census/find-census-data/datapacks',
      boundaries:
        'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3',
    },
  };

  fs.writeFileSync(path.join(OUT, 'postcodes.json'), JSON.stringify(records));
  fs.writeFileSync(
    path.join(OUT, 'series.json'),
    JSON.stringify({ solarMonths, battMonths, national: { s: solarNational, b: battNational }, states: stateSeries, postcodes: seriesOut }),
  );
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));

  const geoSrc = path.join(CACHE, 'poa.geojson');
  if (fs.existsSync(geoSrc)) {
    const geo = JSON.parse(fs.readFileSync(geoSrc, 'utf8'));
    const before = geo.features.length;
    geo.features = geo.features.filter((f) => f.geometry && normalisePostcode(f.properties?.POA_CODE21));
    for (const f of geo.features) f.properties = { pc: normalisePostcode(f.properties.POA_CODE21) };
    log(`geojson features: ${before} -> ${geo.features.length} (dropped null/pseudo postcodes)`);
    fs.writeFileSync(path.join(OUT, 'poa.geojson'), JSON.stringify(geo));
  }

  for (const f of ['postcodes.json', 'series.json', 'meta.json', 'poa.geojson']) {
    const p = path.join(OUT, f);
    if (fs.existsSync(p)) log(`wrote ${f} (${(fs.statSync(p).size / 1e6).toFixed(2)} MB)`);
  }
  log(
    `national: ${totalSolar.toLocaleString()} solar systems, ${totalBatt.toLocaleString()} batteries, ` +
      `${meta.national.per100} per 100 dwellings`,
  );
}

// Only run the pipeline when invoked directly — tests import pickPrimaryLocality.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
