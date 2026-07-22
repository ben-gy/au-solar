// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { ViewContext } from '../viewContext';
import { buildInsights } from '../analysis';
import { escapeHtml } from '../utils/format';

/** Auto-detected findings — computed from the data, never hand-written. */
export function renderInsights(root: HTMLElement, ctx: ViewContext): void {
  const { meta } = ctx.data;
  const insights = buildInsights({
    all: ctx.data.postcodes,
    nationalPer100: meta.national.per100,
    battTotal: meta.national.battery,
    battMonths: meta.battMonths.length,
  });

  root.innerHTML = `
    <div class="view-head">
      <h1 class="view-title">Insights</h1>
      <p class="view-sub">
        Findings detected automatically from this month's data — outliers, gaps and surges. These update
        whenever the pipeline runs, so they reflect the latest release rather than a fixed narrative.
      </p>
    </div>
    <div class="insight-grid">
      ${insights
        .map(
          (i) => `
        <div class="insight ${i.severity}">
          <h3>${escapeHtml(i.title)}</h3>
          <p>${escapeHtml(i.body)}</p>
          ${
            i.postcodes.length
              ? `<div class="insight-links">${i.postcodes
                  .map((pc) => {
                    const p = ctx.data.byPostcode.get(pc);
                    return `<button class="chip" data-pc="${pc}">${pc}${p?.loc ? ` ${escapeHtml(p.loc)}` : ''}</button>`;
                  })
                  .join('')}</div>`
              : ''
          }
        </div>`,
        )
        .join('')}
    </div>
    ${insights.length === 0 ? '<div class="empty">No insights could be computed from this dataset.</div>' : ''}
  `;

  root.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('[data-pc]');
    if (btn) ctx.openPostcode(btn.getAttribute('data-pc') as string);
  });
}
