// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { ViewContext } from '../viewContext';
import { STATE_ORDER, isGrowthCorridor, stateColour } from '../data';
import { sparkline } from '../components/charts';
import { escapeHtml, formatKw, formatNumber, formatPer100 } from '../utils/format';
import type { Postcode } from '../types';

type SortKey = 'pc' | 'loc' | 'st' | 'dw' | 'solar' | 'per100' | 'bat' | 'batPer100' | 'kw' | 'avgKw' | 'ownerSepShare';

const COLUMNS: Array<{ key: SortKey; label: string; numeric: boolean; tip?: string }> = [
  { key: 'pc', label: 'Postcode', numeric: false },
  { key: 'loc', label: 'Locality', numeric: false },
  { key: 'st', label: 'State', numeric: false },
  { key: 'dw', label: 'Homes', numeric: true, tip: 'Occupied private dwellings, Census 2021' },
  { key: 'solar', label: 'Systems', numeric: true },
  { key: 'per100', label: 'Per 100 homes', numeric: true },
  { key: 'kw', label: 'Capacity', numeric: true },
  { key: 'avgKw', label: 'Avg size', numeric: true },
  { key: 'bat', label: 'Batteries', numeric: true },
  { key: 'batPer100', label: 'Bat/100', numeric: true },
  { key: 'ownerSepShare', label: 'Owner houses', numeric: true, tip: 'Share of homes that are owner-occupied detached houses' },
];

export function renderExplorer(root: HTMLElement, ctx: ViewContext): void {
  let sortKey: SortKey = (localStorage.getItem('exp.sort') as SortKey) || 'solar';
  let sortDir: 'asc' | 'desc' = (localStorage.getItem('exp.dir') as 'asc' | 'desc') || 'desc';
  let query = '';
  let state = 'ALL';
  let limit = 100;

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">Explorer</h1>
      <p class="view-sub">
        Every postcode in the dataset. Search by postcode or suburb, sort by any column, click a row for
        the full breakdown. ${formatNumber(ctx.data.postcodes.length)} postcodes in total.
      </p>
    </div>
    <div class="controls">
      <input class="text-input" data-role="q" type="search" placeholder="Search postcode or suburb…" style="width:min(260px,60vw)" aria-label="Search postcode or suburb" />
      <select data-role="state">
        <option value="ALL">All states</option>
        ${STATE_ORDER.map((s) => `<option value="${s}">${s}</option>`).join('')}
      </select>
      <span class="field-label" data-role="count"></span>
    </div>
    <div class="table-scroll">
      <table class="data">
        <thead><tr data-role="head"></tr></thead>
        <tbody data-role="body"></tbody>
      </table>
    </div>
    <div style="text-align:center;margin-top:var(--space-lg)">
      <button class="chip" data-role="more" style="padding:7px 16px">Show more</button>
    </div>
  `;

  const bodyEl = root.querySelector('[data-role="body"]') as HTMLElement;
  const headEl = root.querySelector('[data-role="head"]') as HTMLElement;
  const countEl = root.querySelector('[data-role="count"]') as HTMLElement;
  const moreBtn = root.querySelector('[data-role="more"]') as HTMLButtonElement;

  const value = (p: Postcode, k: SortKey): string | number => {
    const v = p[k as keyof Postcode];
    if (v == null) return sortDir === 'asc' ? Infinity : -Infinity;
    return v as string | number;
  };

  const filtered = (): Postcode[] => {
    const q = query.trim().toLowerCase();
    let rows = ctx.data.postcodes;
    if (state !== 'ALL') rows = rows.filter((p) => p.st === state);
    if (q) {
      rows = rows.filter(
        (p) => p.pc.includes(q) || p.locs.some((l) => l.toLowerCase().includes(q)) || p.lga.toLowerCase().includes(q),
      );
    }
    return rows.slice().sort((a, b) => {
      const av = value(a, sortKey);
      const bv = value(b, sortKey);
      let cmp: number;
      if (typeof av === 'string' || typeof bv === 'string') cmp = String(av).localeCompare(String(bv));
      else cmp = (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  };

  const drawHead = () => {
    headEl.innerHTML = COLUMNS.map(
      (c) => `
        <th class="sortable ${c.numeric ? 't-right' : ''}" data-sort="${c.key}" ${c.tip ? `data-tip="${escapeHtml(c.tip)}"` : ''}>
          ${escapeHtml(c.label)}${sortKey === c.key ? `<span class="arrow">${sortDir === 'asc' ? '▲' : '▼'}</span>` : ''}
        </th>`,
    ).join('') + '<th>Trend</th>';
  };

  const draw = () => {
    const rows = filtered();
    countEl.textContent = `${formatNumber(rows.length)} postcode${rows.length === 1 ? '' : 's'}`;
    const shown = rows.slice(0, limit);
    bodyEl.innerHTML = shown
      .map(
        (p) => `
        <tr data-pc="${p.pc}" tabindex="0">
          <td class="pc-cell">${escapeHtml(p.pc)}</td>
          <td class="loc-cell" title="${escapeHtml(p.locs.join(', '))}">${escapeHtml(p.loc || '—')}</td>
          <td>${p.st ? `<span class="pill" style="background:${stateColour(p.st)}">${escapeHtml(p.st)}</span>` : '—'}</td>
          <td class="t-num">${p.dw ? formatNumber(p.dw) : '—'}</td>
          <td class="t-num">${formatNumber(p.solar)}</td>
          <td class="t-num">${formatPer100(p.per100)} ${isGrowthCorridor(p) ? '<span class="flag" data-tip="More systems than 2021 homes — new houses built since the Census, or farm/business rooftops. Ratio overshoots.">⚠</span>' : ''}</td>
          <td class="t-num">${p.kw ? formatKw(p.kw) : '—'}</td>
          <td class="t-num">${p.avgKw != null ? p.avgKw.toFixed(1) : '—'}</td>
          <td class="t-num">${formatNumber(p.bat)}</td>
          <td class="t-num">${p.batPer100 != null ? p.batPer100.toFixed(2) : '—'}</td>
          <td class="t-num">${p.ownerSepShare != null ? `${p.ownerSepShare.toFixed(0)}%` : '—'}</td>
          <td>${sparkline(p.yr)}</td>
        </tr>`,
      )
      .join('');
    if (shown.length === 0) {
      bodyEl.innerHTML = `<tr><td colspan="12"><div class="empty">No postcodes match “${escapeHtml(query)}”.</div></td></tr>`;
    }
    moreBtn.style.display = rows.length > limit ? '' : 'none';
    moreBtn.textContent = `Show more (${formatNumber(Math.min(200, rows.length - limit))} of ${formatNumber(rows.length - limit)} remaining)`;
  };

  headEl.addEventListener('click', (e) => {
    const th = (e.target as Element).closest('[data-sort]');
    if (!th) return;
    const k = th.getAttribute('data-sort') as SortKey;
    if (k === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortKey = k;
      sortDir = COLUMNS.find((c) => c.key === k)?.numeric ? 'desc' : 'asc';
    }
    localStorage.setItem('exp.sort', sortKey);
    localStorage.setItem('exp.dir', sortDir);
    limit = 100;
    drawHead();
    draw();
  });

  bodyEl.addEventListener('click', (e) => {
    const tr = (e.target as Element).closest('[data-pc]');
    if (tr) ctx.openPostcode(tr.getAttribute('data-pc') as string);
  });
  bodyEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const tr = (e.target as Element).closest('[data-pc]');
    if (tr) ctx.openPostcode(tr.getAttribute('data-pc') as string);
  });

  // 300 ms debounce on search.
  let timer: number | undefined;
  root.querySelector('[data-role="q"]')?.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      query = v;
      limit = 100;
      draw();
    }, 300);
  });
  root.querySelector('[data-role="state"]')?.addEventListener('change', (e) => {
    state = (e.target as HTMLSelectElement).value;
    limit = 100;
    draw();
  });
  moreBtn.addEventListener('click', () => {
    limit += 200;
    draw();
  });

  drawHead();
  draw();
}
