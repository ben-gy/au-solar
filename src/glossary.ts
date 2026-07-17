/** Domain jargon, defined for a reader who knows nothing about solar policy. */
export interface GlossaryEntry {
  term: string;
  title: string;
  body: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  'per-100': {
    term: 'per-100',
    title: 'Systems per 100 dwellings',
    body:
      'Rooftop solar systems installed in a postcode since 2001, divided by the number of occupied homes there at the 2021 Census, times 100. It is NOT the percentage of homes with solar: the top number counts every system ever installed (including replacements and upgrades of older systems), while the bottom number is a 2021 snapshot. That is why some fast-growing postcodes score above 100.',
  },
  sres: {
    term: 'sres',
    title: 'Small-scale Renewable Energy Scheme (SRES)',
    body:
      'The federal scheme that subsidises small solar systems, batteries, solar water heaters and heat pumps. When a system is installed it earns tradeable certificates, and the installer usually discounts them off your invoice up front. Every install in this dataset is a system that claimed those certificates.',
  },
  stc: {
    term: 'stc',
    title: 'Small-scale Technology Certificate (STC)',
    body:
      'The tradeable certificate created when a small renewable system is installed — roughly one per megawatt-hour the system is expected to generate before 2030. Because certificates can legally be created up to 12 months after the installation date, the most recent months of this data are always incomplete and revise upward later.',
  },
  'reporting-lag': {
    term: 'reporting-lag',
    title: 'Why recent months look low',
    body:
      'Installers have up to 12 months to create certificates for a system. The Clean Energy Regulator counts an install in the month it happened, but only once the paperwork arrives — so the newest months keep growing for months afterwards. A recent dip is almost always paperwork, not a real collapse. Provisional months are drawn hatched here and excluded from "latest month" figures.',
  },
  'owner-detached': {
    term: 'owner-detached',
    title: 'Owner-occupied detached houses',
    body:
      'Homes that are separate (free-standing) houses AND lived in by their owner, as a share of all occupied homes in the postcode. This is roughly the group that can actually say yes to solar: they control a roof and they keep the savings. Taken from ABS Census 2021 table G37, which cross-tabulates tenure by dwelling structure.',
  },
  'split-incentive': {
    term: 'split-incentive',
    title: 'The split incentive',
    body:
      'A landlord pays for a solar system but the tenant gets the lower power bill, so neither has much reason to act. The same logic blocks apartments, where the roof is common property shared by dozens of owners. It is the main reason renters and apartment-dwellers are largely locked out of rooftop solar.',
  },
  battery: {
    term: 'battery',
    title: 'Home battery',
    body:
      'A battery that stores your solar generation for use after sunset. Australia had almost none recorded under the SRES until the federal Cheaper Home Batteries programme began on 1 July 2025, which is why the battery series in this dataset starts exactly then.',
  },
  'cheaper-batteries': {
    term: 'cheaper-batteries',
    title: 'Cheaper Home Batteries programme',
    body:
      'A federal subsidy that started on 1 July 2025, cutting roughly 30% off the cost of a home battery by extending small-scale certificates to batteries. It produced one of the fastest technology take-ups in Australian energy history — the "Batteries" view tracks it month by month.',
  },
  capacity: {
    term: 'capacity',
    title: 'Capacity (kW)',
    body:
      'The rated power output of the panels, in kilowatts — how much the system can generate at full sun. Average system size has grown from about 1–2 kW in 2010 to roughly 9–10 kW today, so newer postcodes carry more capacity per system. The scheme also covers commercial systems up to 100 kW, so industrial postcodes show much larger averages than any house would.',
  },
  poa: {
    term: 'poa',
    title: 'Postal Area (POA)',
    body:
      'The ABS approximates Australia Post postcodes with statistical areas called Postal Areas so census data can be published against them. They are very close to postcodes but not identical, and PO-box-only postcodes have no area at all.',
  },
  dwellings: {
    term: 'dwellings',
    title: 'Occupied private dwellings',
    body:
      'Homes that had someone living in them on Census night 2021 — houses, townhouses, apartments. Excludes empty homes and places like hotels and nursing homes. Australia had 9,275,066 of them in 2021; it is the denominator for every per-100 figure here.',
  },
  'growth-corridor': {
    term: 'growth-corridor',
    title: 'More systems than homes',
    body:
      'Some postcodes report more solar systems than they had homes in 2021, which is impossible on its face. Two things cause it. Most are growth corridors: thousands of houses have been built there since the Census, so the numerator is current but the denominator is stuck in 2021. The rest are small rural or industrial postcodes, where farm sheds and business rooftops carry systems that no household lives under. Either way these places really are solar-dense — the exact ratio just cannot be taken at face value.',
  },
  r2: {
    term: 'r2',
    title: 'R² (explained variance)',
    body:
      'How much of the difference between postcodes one factor accounts for. R² of 0.40 means about 40% of the variation in solar uptake lines up with that factor alone — strong for social data, where many causes overlap. It shows association, not proof of cause.',
  },
};

export function glossaryTerm(term: string, label?: string): string {
  const entry = GLOSSARY[term];
  const text = label ?? entry?.title ?? term;
  return `<span class="glossary-link" data-term="${term}" tabindex="0" role="button">${text}</span>`;
}

export function infoIcon(term: string): string {
  return `<button class="info-icon" data-term="${term}" aria-label="What does this mean?" type="button">i</button>`;
}
