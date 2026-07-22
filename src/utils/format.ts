// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
/** Formatting helpers. All display numbers flow through here. */

export function formatNumber(n: number | null | undefined, dp = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-AU', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function formatPer100(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-AU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function formatPercent(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(dp)}%`;
}

/** Compact power: 1234 kW -> "1.23 MW"; 1.2e6 kW -> "1.20 GW". */
export function formatKw(kw: number | null | undefined): string {
  if (kw == null || !Number.isFinite(kw)) return '—';
  if (kw >= 1e6) return `${(kw / 1e6).toFixed(2)} GW`;
  if (kw >= 1e3) return `${(kw / 1e3).toFixed(2)} MW`;
  return `${formatNumber(kw)} kW`;
}

export function formatKwh(kwh: number | null | undefined): string {
  if (kwh == null || !Number.isFinite(kwh)) return '—';
  if (kwh >= 1e6) return `${(kwh / 1e6).toFixed(2)} GWh`;
  if (kwh >= 1e3) return `${(kwh / 1e3).toFixed(2)} MWh`;
  return `${formatNumber(kwh)} kWh`;
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-05" -> "May 2026". */
export function formatMonth(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return key;
  return `${MONTH_NAMES[idx]} ${m[1]}`;
}

/** "2026-05" -> "May 26" for dense axes. */
export function formatMonthShort(key: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return key;
  return `${MONTH_NAMES[idx]} ${m[1].slice(2)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Postcode display with its primary locality: "3000 · Melbourne". */
export function postcodeLabel(pc: string, loc: string): string {
  return loc ? `${pc} · ${loc}` : pc;
}

export function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
