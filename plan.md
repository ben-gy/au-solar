# Site Plan: Rooftop Solar

## Overview
- **Name:** Rooftop Solar
- **Repo name:** au-solar
- **Tagline:** Every rooftop solar panel and home battery in Australia, by postcode — and who's being left behind.

### Naming Convention
Display name "Rooftop Solar" (no country in the name). `country: "AU"` in the index entry renders the flag.

## Target Audience
Australian homeowners and renters wondering "how much solar does my suburb actually have, and should I get it?", plus energy journalists, policy analysts and climate researchers who need per-postcode penetration numbers. Primarily desktop for the analysts, but a large share arrive on mobile from a search like "solar panels [suburb]" — so the postcode search and drill-down must be excellent on a phone.

## Value Proposition
The CER publishes rooftop solar counts per postcode, but only as a 188-column spreadsheet with no denominator — raw counts just tell you which postcodes are big. Nobody joins it to census dwelling data to answer the question people actually have: **what share of homes around me have solar, and why is it so much lower in some suburbs?**

By joining the CER install data to ABS Census G37 (tenure × dwelling structure) this site can show the thing no other tool does — **the solar divide**. Rooftop solar is overwhelmingly a thing that happens to detached houses owned by their occupants. Renters and apartment-dwellers are structurally locked out (the "split incentive": the landlord pays, the tenant saves). This site quantifies that gap postcode by postcode.

It also captures a live policy experiment: the federal **Cheaper Home Batteries** rebate started 1 July 2025, and the CER battery data begins exactly then — 401,185 batteries in 11 months, from a standing start.

## Data Sources
| Source | URL | What it provides | Update frequency | Auth required? |
|--------|-----|-------------------|-----------------|----------------|
| CER SRES postcode data — solar installations | https://cer.gov.au/document/sgu-solar-installations-2011-to-present-and-totals | Monthly solar installs per postcode, Jan 2011–May 2026 + 2001–2010 historic total | Monthly | No |
| CER SRES postcode data — solar capacity | https://cer.gov.au/document/sgu-solar-capacity-2011-to-present-and-totals | Monthly installed kW per postcode | Monthly | No |
| CER SRES postcode data — battery installations | https://cer.gov.au/document/sgu-battery-installations-2011-to-present-and-totals | Monthly battery installs per postcode, Jul 2025– | Monthly | No |
| CER SRES postcode data — battery capacity | https://cer.gov.au/document/sgu-battery-capacity-2011-to-present-and-totals | Monthly installed kWh per postcode | Monthly | No |
| ABS Census 2021 GCP POA — G37 | https://www.abs.gov.au/census/find-census-data/datapacks/download/2021_GCP_POA_for_AUS_short-header.zip | Occupied private dwellings by tenure × dwelling structure per postcode (9,275,066 dwellings) | Every 5 years | No |
| ABS ASGS 2021 POA boundaries | https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026/access-and-downloads/digital-boundary-files/POA_2021_AUST_GDA2020_SHP.zip | 2,640 postcode polygons | Static | No |
| Australian postcodes reference | https://raw.githubusercontent.com/matthewproctor/australianpostcodes/master/australian_postcodes.csv | postcode → locality names, state, lat/long, SA4, LGA | Rolling | No |

### Verified data gotchas (found during research — must be handled)
1. **Quoted thousands separators.** 1,077 of 2,811 rows contain fields like `"1,234"`. A naive `split(',')` corrupts 38% of rows and understated the national total by 89% (477,892 vs the true 4,437,269). **The pipeline must use a real RFC4180 parser.**
2. **Trailing months are incomplete.** STCs can be created up to 12 months after installation, so recent months are under-reported and ramp up later. May 2026 shows 8,992 batteries vs April's 68,598 — an artefact, not a crash. Trend views must hatch/dash the trailing months and exclude them from "latest month" claims.
3. **Installs ≠ households.** Counts include replacements, upgrades and off-grid systems, and the denominator is 2021 dwellings against 2026 installs. So this is **"systems per 100 dwellings"**, never "% of homes with solar" — and it can exceed 100 in some postcodes. Must be labelled honestly everywhere.
4. **Null/pseudo postcodes.** POA codes `2043, 9494, 9797, ZZZZ` have null geometry; CER includes `0000`. Filter them.

## Key Features
1. **Postcode search + drill-down** — type a postcode or suburb, get penetration, rank, tenure/dwelling mix, full monthly history.
2. **Solar Divide scatter** — owner-occupied detached-house share vs solar penetration, the site's signature insight.
3. **Choropleth map** of all 2,640 postcodes, metric-switchable.
4. **Battery Boom view** — the Cheaper Home Batteries rebate effect from July 2025.
5. **Rankings leaderboard** — per-100-dwelling, filterable by state, min-dwelling guard against tiny-postcode noise.
6. **25-year timeline** with policy milestones annotated.
7. **Distribution histogram** — how unequal penetration is.
8. **Auto-detected insights** — outliers, divides, surges.

## Style Direction
**Tone:** friendly/consumer leaning practical — this is a homeowner-facing utility, not a terminal.
**Colour palette:** light theme, warm off-white base with a solar amber/gold accent (`#f59e0b`) and a deep teal secondary for batteries/contrast. Sun-warm without being a novelty; amber reads instantly as "solar" and gives a natural sequential ramp for the choropleth.
**UI density:** balanced — spacious enough for a homeowner on a phone, dense enough for an analyst comparing postcodes.
**Dark/light theme:** light. The audience is the general public.
**Reference sites for tone:** fuelaustralia.org (clean single-purpose utility), APVI pv-map.apvi.org.au (the domain incumbent — this site should beat it on explanation and equity analysis).

## Technical Architecture
- **Stack:** Vanilla TypeScript + Vite
- **Data strategy:** pipeline. CER publishes monthly → **monthly cron** (the fastest allowed, and proportional to the source). Staggered to day 9, 05:23 UTC.
- **Key libraries:** Leaflet 1.9 (map, canvas renderer for 2,640 polygons). Everything else hand-rolled SVG per the factory rules; treemap/tooltip/network/zoom/leaflet copied from `patterns/`.

### Data budget
- `poa.geojson` simplified to 1.88 MB raw / **360 KB gzipped** (mapshaper `-simplify 1.2% keep-shapes`, 180K vertices, real coastlines) — verified during research.
- `postcodes.json` aggregate (~2,800 rows × summary fields) — small.
- Monthly series per postcode chunked into `series.json` only if it stays under ~3 MB; otherwise per-postcode lazy files.

## Layout
Fixed 52px header (logo, postcode search, About `?`). Nav tab row beneath. Main content fills remaining space, `max-width: 1600px`. Drill-down is a right slide-in panel (full-width sheet on mobile) driven by `#postcode=2000`. Sticky footer. Panels stack below 768px.

## Pages/Views
Single page, eight hash-routed view tabs: Map · Rankings · Explorer · Solar Divide · Batteries · Timeline · Distribution · Insights.

## Visualization Strategy
Design research: APVI's pv-map is the domain incumbent — it shows penetration on a map and stops there; it never explains *why* a postcode is low. The bar to clear is explanation, so the signature view is a scatter, not a map.

1. **Map (Leaflet choropleth)** — *Where is it?* Q: how does my area compare geographically? Reveals the coastal-affluent-inner-city vs outer-suburban pattern that a table can't. Canvas renderer for 2,640 polygons; hover tooltip per polygon; click → drill-down.
2. **Solar Divide (scatter)** — *Why?* Q: how much of the variation is explained by who owns the roof? Plots owner-occupied-detached share vs systems per 100 dwellings, one dot per postcode, coloured by state, with a fitted trend line and R². **This is the view that justifies the site** — no other view can show the split-incentive mechanism. Zoom/pan via `svgZoom.ts`; click a dot → drill-down.
3. **Rankings (bar leaderboard)** — *How does it rank?* Q: who's top/bottom? Per-100-dwelling with a minimum-dwelling threshold so a 12-dwelling postcode doesn't win on noise.
4. **Explorer (table)** — *Look mine up.* Sortable/filterable, sparkline per postcode.
5. **Batteries** — *What did the rebate do?* Q: did Cheaper Home Batteries work, and where? Monthly national trend from July 2025 + per-state per-100 bars + top postcodes. Distinct from Timeline because the battery series is 11 months against a policy step-change, not a 25-year arc.
6. **Timeline** — *How did we get here?* 2001–2026 monthly national installs, annotated with policy milestones (2008-09 rebate boom, 2011-12 FiT cuts, STC step-downs, 2025 battery rebate). Incomplete trailing months hatched.
7. **Distribution (histogram)** — *How unequal?* Spread of penetration across postcodes; shows the long low tail that averages hide.
8. **Insights** — *What should I notice?* Auto-detected: highest/lowest penetration, biggest tenure gap, battery surge leaders, postcodes above 100 systems/100 dwellings.

Cross-cutting: shared state colours everywhere; every mark gets `data-tip`; clicking any postcode anywhere opens the same drill-down.
