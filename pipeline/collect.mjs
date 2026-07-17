#!/usr/bin/env node
/**
 * collect.mjs — download every upstream source into pipeline/.cache/.
 *
 * Sources (all public, no auth):
 *   - Clean Energy Regulator SRES postcode data (solar/battery, installs/capacity)
 *   - ABS Census 2021 General Community Profile, Postal Areas, table G37
 *   - ABS ASGS 2021 Postal Area digital boundaries (shapefile -> simplified GeoJSON)
 *   - matthewproctor/australianpostcodes reference (postcode -> locality/state/LGA)
 *
 * Downloads are cached; re-runs only re-fetch what's missing or stale.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'pipeline', '.cache');

const CER = 'https://cer.gov.au/document';
export const CER_FILES = {
  solarInstalls: `${CER}/sgu-solar-installations-2011-to-present-and-totals`,
  solarInstallsHistoric: `${CER}/sgu-solar-installations-2001-to-2010`,
  solarCapacity: `${CER}/sgu-solar-capacity-2011-to-present-and-totals`,
  batteryInstalls: `${CER}/sgu-battery-installations-2011-to-present-and-totals`,
  batteryCapacity: `${CER}/sgu-battery-capacity-2011-to-present-and-totals`,
};

const ABS_GCP_POA =
  'https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_POA_for_AUS_short-header.zip';
const ABS_POA_SHP =
  'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/POA_2021_AUST_GDA2020_SHP.zip';
const POSTCODES_REF =
  'https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv';

function log(msg) {
  process.stdout.write(`[collect] ${msg}\n`);
}

function download(url, dest, { minBytes = 1024 } = {}) {
  if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) {
    log(`cached  ${path.basename(dest)} (${fs.statSync(dest).size.toLocaleString()} bytes)`);
    return dest;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  log(`fetch   ${url}`);
  execFileSync('curl', ['-sSL', '--fail', '--retry', '3', '--retry-delay', '2', '-o', dest, url], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const size = fs.statSync(dest).size;
  if (size < minBytes) {
    throw new Error(`Downloaded ${url} but got only ${size} bytes — source may have moved.`);
  }
  log(`ok      ${path.basename(dest)} (${size.toLocaleString()} bytes)`);
  return dest;
}

function main() {
  fs.mkdirSync(CACHE, { recursive: true });

  // 1. CER installation + capacity CSVs.
  for (const [name, url] of Object.entries(CER_FILES)) {
    download(url, path.join(CACHE, `${name}.csv`), { minBytes: 500 });
  }

  // 2. ABS Census G37 (dwellings by tenure x structure) from the GCP DataPack.
  const gcpZip = download(ABS_GCP_POA, path.join(CACHE, 'gcp_poa.zip'), { minBytes: 1_000_000 });
  const g37 = path.join(CACHE, 'G37_POA.csv');
  if (!fs.existsSync(g37)) {
    log('unzip   G37 from GCP DataPack');
    execFileSync('unzip', ['-o', '-q', '-j', gcpZip, '*2021Census_G37_AUST_POA.csv', '-d', CACHE]);
    fs.renameSync(path.join(CACHE, '2021Census_G37_AUST_POA.csv'), g37);
  }

  // 3. ABS POA boundaries -> simplified GeoJSON via mapshaper.
  //    Never hand-author geometry; always simplify real ABS source data.
  const geo = path.join(CACHE, 'poa.geojson');
  if (!fs.existsSync(geo)) {
    const shpZip = download(ABS_POA_SHP, path.join(CACHE, 'poa_shp.zip'), { minBytes: 1_000_000 });
    const shpDir = path.join(CACHE, 'poa_shp');
    log('unzip   POA shapefile');
    execFileSync('unzip', ['-o', '-q', shpZip, '-d', shpDir]);
    const shp = path.join(shpDir, 'POA_2021_AUST_GDA2020.shp');
    log('mapshaper simplify 1.2% (yields ~1.9 MB / ~360 KB gzipped, 180k vertices)');
    execFileSync(
      'npx',
      [
        '-y',
        'mapshaper',
        shp,
        '-filter-fields',
        'POA_CODE21',
        '-simplify',
        '1.2%',
        'keep-shapes',
        '-o',
        'precision=0.001',
        'format=geojson',
        geo,
      ],
      { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    log(`ok      poa.geojson (${fs.statSync(geo).size.toLocaleString()} bytes)`);
  } else {
    log('cached  poa.geojson');
  }

  // 4. Postcode -> locality/state/LGA reference.
  download(POSTCODES_REF, path.join(CACHE, 'postcodes_ref.csv'), { minBytes: 100_000 });

  log('all sources ready');
}

main();
