import L from 'leaflet';
import type { ViewContext } from '../viewContext';
import { loadGeo, stateColour } from '../data';
import { RAMP, rampColour } from '../components/charts';
import { glossaryTerm } from '../glossary';
import { escapeHtml, formatNumber, formatPer100 } from '../utils/format';

type Metric = 'per100' | 'batPer100' | 'avgKw' | 'solar';

const METRICS: Record<Metric, { label: string; title: string; sub: string; stops: number[]; fmt: (p: any) => string; unit: string }> = {
  per100: {
    label: 'Solar per 100 homes',
    title: 'Rooftop solar systems per 100 homes',
    sub: 'Systems installed since 2001 against occupied homes at the 2021 Census. Darker means more solar.',
    stops: [10, 25, 40, 55, 70, 90],
    fmt: (p) => formatPer100(p.per100),
    unit: 'per 100 homes',
  },
  batPer100: {
    label: 'Batteries per 100 homes',
    title: 'Home batteries per 100 homes',
    sub: 'Batteries installed since the Cheaper Home Batteries rebate began in July 2025.',
    stops: [0.5, 1.5, 3, 5, 8, 12],
    fmt: (p) => (p.batPer100 == null ? '—' : p.batPer100.toFixed(2)),
    unit: 'per 100 homes',
  },
  avgKw: {
    label: 'Average system size',
    title: 'Average solar system size (kW)',
    sub: 'Total rated capacity divided by systems. Early-adopting postcodes carry small 2010s systems; recent adopters install 10 kW+.',
    stops: [4, 5, 6, 7, 8, 9],
    fmt: (p) => (p.avgKw == null ? '—' : `${p.avgKw.toFixed(1)} kW`),
    unit: 'kW average',
  },
  solar: {
    label: 'Total systems',
    title: 'Total solar systems installed',
    sub: 'Raw counts — largely a map of where people live. Switch to a per-home metric to see uptake.',
    stops: [500, 1500, 3000, 5000, 8000, 12000],
    fmt: (p) => formatNumber(p.solar),
    unit: 'systems',
  },
};

/** Mainland Australia + Tasmania. Excludes the far-flung external territories. */
const MAINLAND = L.latLngBounds([-43.8, 112.5], [-9.8, 154.2]);

export function renderMap(root: HTMLElement, ctx: ViewContext): void {
  let metric: Metric = (localStorage.getItem('map.metric') as Metric) || 'per100';

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">Where Australia's solar actually is</h1>
      <p class="view-sub">
        Every ${glossaryTerm('poa', 'postal area')} in Australia, shaded by uptake. The pattern is not about
        sunshine — it is about roofs. Hover any postcode for detail, click to open it.
      </p>
    </div>
    <div class="controls">
      <span class="field-label">Colour by</span>
      <div class="seg" role="group" data-role="metric">
        ${(Object.keys(METRICS) as Metric[])
          .map((m) => `<button class="seg-btn" data-metric="${m}" aria-pressed="${m === metric}">${METRICS[m].label}</button>`)
          .join('')}
      </div>
    </div>
    <div class="panel">
      <div class="panel-title" data-role="title"></div>
      <div class="panel-sub" data-role="sub"></div>
      <div class="map-frame"><div class="map-canvas"></div></div>
      <div class="map-legend" data-role="legend"></div>
    </div>
  `;

  const canvas = root.querySelector('.map-canvas') as HTMLElement;
  const titleEl = root.querySelector('[data-role="title"]') as HTMLElement;
  const subEl = root.querySelector('[data-role="sub"]') as HTMLElement;
  const legendEl = root.querySelector('[data-role="legend"]') as HTMLElement;

  // preferCanvas: 2,640 polygons as individual SVG paths is slow to pan.
  const map = L.map(canvas, { minZoom: 3, maxZoom: 12, scrollWheelZoom: false, preferCanvas: true });
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: 'Tiles © CARTO',
    subdomains: 'abcd',
    minZoom: 3,
    maxZoom: 12,
  }).addTo(map);

  map.fitBounds(MAINLAND, { padding: [6, 6] });

  const valueOf = (pc: string, m: Metric): number | null => {
    const p = ctx.data.byPostcode.get(pc);
    if (!p) return null;
    return (p[m] as number | null) ?? null;
  };

  let layer: L.GeoJSON | null = null;

  const styleFor = (pc: string) => ({
    fillColor: rampColour(valueOf(pc, metric), METRICS[metric].stops),
    fillOpacity: 0.82,
    color: '#ffffff',
    weight: 0.35,
  });

  const renderLegend = () => {
    const cfg = METRICS[metric];
    const labels = [0, ...cfg.stops];
    legendEl.innerHTML = `
      <span class="field-label">${escapeHtml(cfg.unit)}</span>
      <span class="scale-bar">
        ${RAMP.map((c) => `<span class="scale-swatch" style="background:${c}"></span>`).join('')}
      </span>
      <span style="font-family:var(--font-mono);font-size:var(--font-size-xs)">
        ${labels.map((v) => (metric === 'batPer100' ? v : Math.round(v))).join(' · ')}+
      </span>
      <span class="legend-item" style="cursor:default;margin-left:auto">
        <span class="legend-swatch" style="background:#e8e2d6"></span>No census homes
      </span>
    `;
  };

  const paint = () => {
    const cfg = METRICS[metric];
    titleEl.textContent = cfg.title;
    subEl.textContent = cfg.sub;
    renderLegend();
    if (layer) layer.setStyle((f: any) => styleFor(f.properties.pc));
    root.querySelectorAll('[data-metric]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-metric') === metric));
    });
  };

  root.querySelector('[data-role="metric"]')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-metric]');
    if (!btn) return;
    metric = btn.getAttribute('data-metric') as Metric;
    localStorage.setItem('map.metric', metric);
    paint();
  });

  loadGeo()
    .then((geo) => {
      layer = L.geoJSON(geo, {
        attribution: 'Boundaries: ABS ASGS 2021 (CC BY 4.0) · Data: Clean Energy Regulator',
        style: (f: any) => styleFor(f.properties.pc),
        onEachFeature: (f: any, lyr: L.Layer) => {
          const pc = f.properties.pc as string;
          const p = ctx.data.byPostcode.get(pc);
          const name = p?.loc ? `${pc} · ${p.loc}` : pc;
          const tip = p
            ? `<strong>${escapeHtml(name)}</strong><br>` +
              `${formatPer100(p.per100)} solar per 100 homes<br>` +
              `${formatNumber(p.solar)} systems · ${formatNumber(p.bat)} batteries<br>` +
              `<span style="color:#6b5b45">${formatNumber(p.dw)} homes · ${p.st}</span>`
            : `<strong>${escapeHtml(pc)}</strong><br><span style="color:#6b5b45">No data</span>`;
          lyr.bindTooltip(tip, { sticky: true, className: 'map-tip' });
          lyr.on({
            mouseover: () => (lyr as L.Path).setStyle({ weight: 2, color: '#2b2113' }),
            mouseout: () => layer?.resetStyle(lyr as L.Path),
            click: () => ctx.openPostcode(pc),
          });
        },
      }).addTo(map);

      // Zero-size defence: Leaflet mis-measures a container that hasn't settled.
      // Fit to mainland + Tasmania rather than layer.getBounds(): the POA file
      // includes Christmas (105°E) and Norfolk (168°E) Islands, and fitting that
      // full span strands Australia in a sea of empty ocean. Territories are
      // still there to pan to.
      requestAnimationFrame(() => {
        map.invalidateSize();
        map.fitBounds(MAINLAND, { padding: [6, 6] });
      });
      paint();
    })
    .catch(() => {
      canvas.innerHTML =
        '<div class="error-box" style="margin:var(--space-lg)">Could not load the postcode boundaries.</div>';
    });

  paint();

  // State quick-zoom.
  const zooms: Record<string, [number, number, number]> = {
    NSW: [-32.5, 147, 6],
    VIC: [-37, 145, 6],
    QLD: [-22, 145, 5],
    SA: [-32, 135, 5],
    WA: [-26, 121, 5],
    TAS: [-42, 146.5, 7],
    NT: [-19, 133, 5],
    ACT: [-35.3, 149.1, 9],
  };
  const zoomBar = document.createElement('div');
  zoomBar.className = 'controls';
  zoomBar.style.marginTop = 'var(--space-md)';
  zoomBar.innerHTML =
    '<span class="field-label">Jump to</span>' +
    Object.keys(zooms)
      .map(
        (s) =>
          `<button class="chip" data-zoom="${s}" style="color:${stateColour(s)};font-weight:700">${s}</button>`,
      )
      .join('') +
    '<button class="chip" data-zoom="ALL">All of Australia</button>';
  (root.querySelector('.panel') as HTMLElement).appendChild(zoomBar);
  zoomBar.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-zoom]');
    if (!btn) return;
    const s = btn.getAttribute('data-zoom') as string;
    if (s === 'ALL') {
      map.fitBounds(MAINLAND, { padding: [6, 6] });
      return;
    }
    const [lat, lng, z] = zooms[s];
    map.setView([lat, lng], z);
  });
}
