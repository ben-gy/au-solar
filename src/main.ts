// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.

import './styles.css';
import { loadDataset, searchPostcodes, type Dataset } from './data';
import type { ViewId } from './types';
import type { ViewContext } from './viewContext';
import { initTooltip } from './components/tooltip';
import { initGlossary } from './components/glossaryPopover';
import { createAbout } from './components/about';
import { createDrilldown } from './components/drilldown';
import { renderMap } from './views/map';
import { renderRankings } from './views/rankings';
import { renderExplorer } from './views/explorer';
import { renderDivide } from './views/divide';
import { renderBatteries } from './views/batteries';
import { renderTimeline } from './views/timeline';
import { renderDistribution } from './views/distribution';
import { renderInsights } from './views/insights';
import { escapeHtml, formatDate, formatNumber, formatPer100 } from './utils/format';

// Nav tabs are words only — never count badges.
const VIEWS: Array<{ id: ViewId; label: string; render: (root: HTMLElement, ctx: ViewContext) => void }> = [
  { id: 'map', label: 'Map', render: renderMap },
  { id: 'divide', label: 'Solar Divide', render: renderDivide },
  { id: 'rankings', label: 'Rankings', render: renderRankings },
  { id: 'explorer', label: 'Explorer', render: renderExplorer },
  { id: 'batteries', label: 'Batteries', render: renderBatteries },
  { id: 'timeline', label: 'Timeline', render: renderTimeline },
  { id: 'distribution', label: 'Distribution', render: renderDistribution },
  { id: 'insights', label: 'Insights', render: renderInsights },
];

const LOGO = `<svg viewBox="0 0 32 32" aria-hidden="true">
  <circle cx="16" cy="11.5" r="4.6" fill="#f59e0b"/>
  <g stroke="#f59e0b" stroke-width="1.7" stroke-linecap="round">
    <path d="M16 3.2v2.2M16 17.6v2.2M23.6 11.5h-2.2M10.6 11.5H8.4M21.4 6.1l-1.6 1.6M12.2 15.3l-1.6 1.6M21.4 16.9l-1.6-1.6M12.2 7.7l-1.6-1.6"/>
  </g>
  <path d="M6 28l3.2-6.6h13.6L26 28z" fill="#0f766e"/>
  <g stroke="#fffdf7" stroke-width="1.1">
    <path d="M11.4 21.4L9.6 28M20.6 21.4l1.8 6.6M8.1 24.7h15.8"/>
  </g>
</svg>`;

function parseHash(): { view: ViewId | null; postcode: string | null } {
  const h = location.hash.replace(/^#/, '');
  if (!h) return { view: null, postcode: null };
  if (h.startsWith('postcode=')) return { view: null, postcode: h.slice('postcode='.length) };
  const view = VIEWS.find((v) => v.id === h)?.id ?? null;
  return { view, postcode: null };
}

function shell(app: HTMLElement, data: Dataset): void {
  const { meta } = data;

  app.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <a class="brand" href="#map">${LOGO}<span>Rooftop Solar</span><span class="brand-sub">Australia, by postcode</span></a>
        <div class="search-wrap">
          <input class="search-input" type="search" placeholder="Search a postcode or suburb…" aria-label="Search a postcode or suburb" autocomplete="off" />
          <div class="search-results" role="listbox"></div>
        </div>
        <div class="header-spacer"></div>
        <button class="icon-btn" data-role="about" aria-label="About this site" title="About this site">?</button>
      </div>
    </header>
    <nav class="nav-tabs" aria-label="Views">
      <div class="nav-inner" role="tablist">
        ${VIEWS.map((v) => `<button class="nav-tab" role="tab" data-view="${v.id}" aria-selected="false">${v.label}</button>`).join('')}
      </div>
    </nav>
    <main class="main-content" id="view-root"></main>
    <footer class="site-footer">
      <div class="footer-inner">
        <span>
          Data: <a href="${meta.sources.cer}" target="_blank" rel="noopener">Clean Energy Regulator</a> ·
          <a href="${meta.sources.census}" target="_blank" rel="noopener">ABS Census 2021</a> ·
          boundaries ABS ASGS 2021 (CC BY 4.0). Updated ${formatDate(meta.generated)}.
        </span>
        <span>
          Built by <a href="https://benrichardson.dev/">benrichardson.dev</a> ·
          <a href="https://sites.benrichardson.dev" target="_blank" rel="noopener">more tools &amp; sites</a>
        </span>
      </div>
    </footer>
  `;

  const viewRoot = app.querySelector('#view-root') as HTMLElement;
  const about = createAbout(meta);
  const drill = createDrilldown(data);

  let current: ViewId = 'map';

  const ctx: ViewContext = {
    data,
    openPostcode: (pc) => drill.open(pc),
    goTo: (v) => show(v),
  };

  function show(id: ViewId, pushHash = true): void {
    const view = VIEWS.find((v) => v.id === id) ?? VIEWS[0];
    // Switching view while a postcode drawer is open should dismiss it —
    // otherwise the drawer hangs over a view the user has navigated away from.
    drill.close();
    current = view.id;
    app.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-view') === current)));
    viewRoot.innerHTML = '';
    try {
      view.render(viewRoot, ctx);
    } catch {
      viewRoot.innerHTML = '<div class="error-box">Something went wrong rendering this view. Try another tab.</div>';
    }
    if (pushHash) history.replaceState(null, '', `#${current}`);
    window.scrollTo({ top: 0 });
  }

  app.querySelector('.nav-inner')?.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-view]');
    if (btn) show(btn.getAttribute('data-view') as ViewId);
  });
  app.querySelector('[data-role="about"]')?.addEventListener('click', () => about.open());
  app.querySelector('.brand')?.addEventListener('click', (e) => {
    e.preventDefault();
    show('map');
  });

  // ── Header search ──
  const input = app.querySelector('.search-input') as HTMLInputElement;
  const results = app.querySelector('.search-results') as HTMLElement;
  let hits: ReturnType<typeof searchPostcodes> = [];
  let cursor = -1;

  const closeSearch = () => {
    results.innerHTML = '';
    cursor = -1;
  };

  const paintResults = () => {
    results.innerHTML = hits
      .map(
        (p, i) => `
        <button class="search-item" data-pc="${p.pc}" role="option" aria-selected="${i === cursor}">
          <strong>${escapeHtml(p.pc)}</strong>
          <span>${escapeHtml(p.loc || '—')}${p.st ? ` · ${escapeHtml(p.st)}` : ''}</span>
          <em>${formatPer100(p.per100)}/100</em>
        </button>`,
      )
      .join('');
  };

  let timer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      hits = searchPostcodes(data.postcodes, input.value);
      cursor = -1;
      paintResults();
    }, 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSearch();
      input.blur();
      return;
    }
    if (!hits.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = (cursor + 1) % hits.length;
      paintResults();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = (cursor - 1 + hits.length) % hits.length;
      paintResults();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = hits[cursor >= 0 ? cursor : 0];
      if (pick) {
        drill.open(pick.pc);
        input.value = '';
        closeSearch();
      }
    }
  });

  results.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-pc]');
    if (!btn) return;
    drill.open(btn.getAttribute('data-pc') as string);
    input.value = '';
    closeSearch();
  });

  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.search-wrap')) closeSearch();
  });

  // ── Routing ──
  const initial = parseHash();
  show(initial.view ?? 'map', !initial.postcode);
  if (initial.postcode) drill.open(initial.postcode);

  window.addEventListener('hashchange', () => {
    const { view, postcode } = parseHash();
    if (postcode) drill.open(postcode);
    else if (view && view !== current) show(view, false);
  });
}

function renderError(app: HTMLElement, retry: () => void): void {
  app.innerHTML = `
    <main class="main-content">
      <div class="error-box">
        <strong>Could not load the data.</strong>
        <p style="margin-top:8px">Check your connection and try again.</p>
        <button type="button">Retry</button>
      </div>
    </main>`;
  app.querySelector('button')?.addEventListener('click', retry);
}

async function boot(): Promise<void> {
  const app = document.getElementById('app') as HTMLElement;
  app.innerHTML = `
    <main class="main-content">
      <div class="loading">Loading Australia's rooftop solar data…</div>
      <div class="skeleton"></div>
    </main>`;

  initTooltip();
  initGlossary();

  try {
    const data = await loadDataset();
    shell(app, data);
  } catch {
    renderError(app, () => {
      void boot();
    });
  }
}

void boot();

// Keep the bundle honest about unused imports in dev builds.
export type { Dataset };
export { formatNumber };
