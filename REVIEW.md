# Rooftop Solar — Build Review

This file exists only to create a reviewable PR. All code is already deployed on `main`.

**Merge this PR to acknowledge the build.** Closing without merging is also fine.

## Links

- **Custom domain:** https://au-solar.benrichardson.dev *(live, TLS cert issued, verified)*
- **GitHub Pages:** https://ben-gy.github.io/au-solar/ *(redirects to the custom domain)*

## DNS

Already provisioned — no manual step needed.

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `au-solar` | `ben-gy.github.io` | DNS only (grey cloud) |

`https_enforced = true` confirmed.

## What it does

Joins Clean Energy Regulator small-scale installation data (4,437,265 solar systems and
401,185 home batteries, Apr 2001 – May 2026, per postcode) to ABS Census 2021 dwelling
counts — so instead of raw counts that just rank postcodes by size, it shows uptake per
home, and *who* is getting it.

The headline: owner-occupied detached-house share correlates with solar uptake at
**r = 0.63** across 2,079 postcodes — roughly 40% of the entire gap between postcodes
from a single variable. Angle Vale (SA) has 203 systems per 100 homes; South Wharf
(Melbourne, 98% apartments) has 0.4.

## Verified on production

- All 8 views render, zero console errors, no NaN/blank views
- Real trusted click on a scatter dot → drill-down opens, rank correct (#1 of 2,079)
- Hover tooltips fire on data marks; About modal renders above the Leaflet map
- No horizontal overflow at 375px on any view or the drawer (asserted, not eyeballed)
- Production bundle hash byte-identical to the locally verified build
- 172 unit tests pass

## Data caveats surfaced in the UI (not hidden)

1. **Not "% of homes with solar"** — installs include replacements/upgrades against a 2021 denominator.
2. **Recent months are provisional** — certificates lodge up to 12 months late, so trailing months are hatched and excluded from headline figures.
3. **103 postcodes exceed 100 systems per 100 homes** — growth corridors plus rural/industrial rooftops. Flagged with ⚠ everywhere, never silently dropped.
