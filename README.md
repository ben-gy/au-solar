# Rooftop Solar

**Every rooftop solar panel and home battery in Australia, by postcode — and who's being left behind.**

🔗 **Live:** [https://au-solar.benrichardson.dev](https://au-solar.benrichardson.dev)

## What is this?

Australia has more rooftop solar per person than any country on earth — 4,437,265 systems installed since 2001. The Clean Energy Regulator publishes the counts per postcode, but only as a 188-column spreadsheet with no denominator, which means the raw data mostly just tells you which postcodes are big.

This site divides every count by the number of homes in that postcode (ABS Census 2021) and joins it to census data on who owns those homes. That turns the question from *"how much solar is there?"* into *"who is getting it, and who isn't?"*

The answer is stark. Rooftop solar is overwhelmingly something that happens to detached houses owned by the people living in them. Across 2,079 postcodes, the share of homes that are owner-occupied detached houses correlates with solar uptake at **r = 0.63** — about 40% of the entire gap between postcodes, explained by one variable. Angle Vale in South Australia has 203 systems per 100 homes. South Wharf in Melbourne, where 98% of homes are apartments, has 0.4. Same subsidy, same sun, a 508× gap. Renters and apartment-dwellers are structurally locked out: the landlord pays and the tenant saves, and an apartment roof is common property no single household can touch.

The site also captures a live policy experiment. The federal Cheaper Home Batteries rebate began on 1 July 2025, and the scheme's battery records start that same month — 401,185 batteries in 11 months, from a standing start.

## Who is this for?

Australian homeowners and renters who want to know what their own suburb actually looks like before deciding whether solar is worth it, and energy journalists, policy analysts and climate researchers who need defensible per-postcode penetration numbers with a real denominator. Most visitors arrive on a phone from a search like "solar panels [suburb]", so the postcode search and drill-down are built to answer that question in one tap; the scatter, matrix and timeline views are there for the people who stay.

## Data Sources

| Source | What it provides | Update frequency |
|--------|-------------------|-----------------|
| [Clean Energy Regulator — small-scale installation postcode data](https://cer.gov.au/markets/reports-and-data/small-scale-installation-postcode-data) | Monthly solar and battery installs + capacity for every postcode, Apr 2001 – May 2026 | Monthly |
| [ABS Census 2021 GCP, Postal Areas, table G37](https://www.abs.gov.au/census/find-census-data/datapacks) | Occupied private dwellings by tenure × dwelling structure (9,275,066 homes) — the denominator and the ownership analysis | Every 5 years |
| [ABS ASGS 2021 Postal Area boundaries](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3) | 2,640 postcode polygons for the choropleth | Static |
| [matthewproctor/australianpostcodes](https://github.com/matthewproctor/australianpostcodes) | Postcode → locality, state, LGA, statistical area | Rolling |

All sources are public, free, and CC BY 4.0. No API keys.

## Features

- **Postcode search and drill-down** — type a postcode or suburb; get uptake, national and state rank, tenure and dwelling mix, and the full monthly history. Hash-linkable (`#postcode=3000`).
- **Solar Divide** — the signature view. A 2,079-point scatter of ownership against uptake with a fitted trend line and R², switchable between owner-occupied houses, renters and apartments.
- **Map** — a Leaflet choropleth of all 2,640 postal areas, switchable between solar per 100 homes, batteries per 100, average system size and raw totals.
- **Rankings** — highest and lowest postcodes, per 100 homes, filterable by state, with a state-level rollup.
- **Explorer** — every postcode, sortable on any column, with a per-postcode sparkline.
- **Batteries** — the Cheaper Home Batteries rebate tracked month by month from zero.
- **Timeline** — 25 years of installs, stackable by state, annotated with the policy decisions behind each peak and trough.
- **Distribution** — how unequal uptake is, with click-through to the postcodes in any bar.
- **Insights** — outliers, gaps and surges detected automatically from each month's data.

## Tech Stack

- **Runtime:** Vanilla TypeScript
- **Build:** Vite 6
- **Testing:** Vitest (172 tests)
- **Hosting:** GitHub Pages (static, no backend)
- **Data:** GitHub Actions pipeline, monthly
- **Maps:** Leaflet 1.9 with a canvas renderer (2,640 polygons)

Charts are hand-rolled SVG — no charting library.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Production build
npm run build

# Preview production build
npm run preview

# Refresh the data (downloads ~100 MB of sources, writes public/data/)
node pipeline/collect.mjs && node pipeline/aggregate.mjs
```

## How it works

`pipeline/collect.mjs` downloads the CER CSVs, the ABS DataPack and the ABS boundary shapefile, and simplifies the boundaries with mapshaper (1.2%, ~180k vertices → 1.9 MB / 360 KB gzipped). `pipeline/aggregate.mjs` parses and joins them, then writes four files to `public/data/`: a per-postcode summary, the monthly series (lazy-loaded), a metadata file, and the GeoJSON. The browser fetches the summary at load and everything else on demand. A monthly GitHub Actions cron re-runs both and commits the result — matching the Clean Energy Regulator's own publication cadence.

### Three things that will bite you if you touch the pipeline

1. **The CER CSVs quote their thousands separators.** 1,077 of 2,811 rows contain a field like `"1,234"`. A naive `line.split(',')` shifts every column after the first quoted value and understates the national total by 89% — 477,892 instead of the true 4,437,269. `pipeline/lib/csv.mjs` is a proper RFC4180 parser for exactly this reason, and it is unit tested.

2. **Recent months are always incomplete.** Certificates can be created up to 12 months after installation, so the newest months are under-reported and revise upward later. May 2026 shows 8,992 batteries against April's 68,598 — that is paperwork, not a collapse. `detectIncompleteMonths` flags the trailing months and the UI hatches them.

3. **The denominator is from 2021, the installs are from 2026.** 103 postcodes report more systems than they had homes. Most are growth corridors built out since the Census; the rest are rural and industrial postcodes where farm and business rooftops carry systems no household lives under. They are flagged with a ⚠ everywhere they appear, never silently dropped.

## Caveats

This is **systems per 100 homes**, not "% of homes with solar". The numerator counts every system ever installed, including replacements and upgrades; the denominator is a 2021 snapshot. It runs higher than the true share of households with a working system. And the Solar Divide shows a strong association, not proof of cause — income, roof age, climate and state policy all overlap with home ownership.

## license

[GNU Affero General Public License v3.0 or later](./LICENSE), with an attribution
requirement added under section 7(b) — see
[ADDITIONAL-TERMS.md](./ADDITIONAL-TERMS.md).

In short: you may run, modify, redistribute and even sell this, but if you
distribute it — or run a modified version where other people can reach it — you
have to publish your source under the same licence and keep the attribution. A
separate commercial licence without those obligations is available on request:
<hi@ben.gy>.

Third-party components keep their own licences — see
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
