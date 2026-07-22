// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { Meta } from '../types';
import { glossaryTerm } from '../glossary';
import { formatDate, formatMonth, formatNumber } from '../utils/format';

/** About modal: what this is, where the data comes from, and what it cannot tell you. */
export function createAbout(meta: Meta): { open: () => void; close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'About Rooftop Solar');

  modal.innerHTML = `
    <button class="modal-close" aria-label="Close">✕</button>
    <h2>About Rooftop Solar</h2>
    <p>
      Australia has more rooftop solar per person than any country on earth. This site shows where it
      actually is — every one of the <strong>${formatNumber(meta.national.solar)}</strong> systems
      installed since 2001, and every one of the <strong>${formatNumber(meta.national.battery)}</strong>
      home batteries installed since the rebate began, broken down by postcode.
    </p>
    <p>
      Raw install counts mostly just tell you which postcodes are big. So every count here is divided by
      the number of homes in that postcode, and joined to census data on who owns them — which turns the
      question from <em>“how much solar is there?”</em> into <em>“who is getting it, and who isn’t?”</em>
    </p>

    <h3>Where the data comes from</h3>
    <ul>
      <li>
        <strong>Clean Energy Regulator</strong> — small-scale installation postcode data under the
        ${glossaryTerm('sres', 'Small-scale Renewable Energy Scheme')}. Monthly installs and capacity per
        postcode, currently covering ${formatMonth(meta.solarMonths[0])} to
        ${formatMonth(meta.latestSolarMonth)}. Updated monthly.
      </li>
      <li>
        <strong>ABS Census 2021</strong> (table G37) — ${glossaryTerm('dwellings', 'occupied private dwellings')}
        by tenure and dwelling structure for each ${glossaryTerm('poa', 'postal area')}. This is the
        denominator, and the source of the ownership analysis.
      </li>
      <li>
        <strong>ABS ASGS 2021</strong> — postal area boundaries for the map.
      </li>
    </ul>

    <h3>How often it updates</h3>
    <p>
      An automated pipeline re-downloads all sources monthly, matching the Clean Energy Regulator's own
      publication cycle. Data last built ${formatDate(meta.generated)}.
    </p>

    <h3>Important limits — please read</h3>
    <ul>
      <li>
        <strong>This is not “% of homes with solar”.</strong> ${glossaryTerm('per-100', 'Systems per 100 dwellings')}
        counts every system ever installed, including replacements and upgrades, against a 2021 home count.
        It runs higher than the true share of households with a working system.
      </li>
      <li>
        <strong>Recent months are incomplete.</strong> ${glossaryTerm('stc', 'Certificates')} can be created up
        to 12 months after installation, so the newest months are under-reported and revise upward later.
        The ${meta.solarProvisional} most recent solar month(s) and ${meta.battProvisional} most recent battery
        month(s) are drawn hatched and excluded from headline figures.
        ${glossaryTerm('reporting-lag', 'Why?')}
      </li>
      <li>
        <strong>${glossaryTerm('growth-corridor', 'Some ratios overshoot')}.</strong> A few postcodes report
        more systems than 2021 homes — either they were built out after the Census, or they are rural and
        industrial areas where farm and business rooftops carry systems no household lives under. They are
        flagged with a ⚠ wherever they appear.
      </li>
      <li>
        <strong>Correlation is not cause.</strong> The Solar Divide view shows a strong association between
        home ownership and solar uptake. Income, roof age, climate and state policy all overlap with it.
      </li>
      <li>
        Postal areas approximate postcodes and PO-box-only postcodes have no boundary, so a few postcodes
        appear in the tables but not on the map.
      </li>
    </ul>

    <h3>Licence</h3>
    <p>
      Clean Energy Regulator and ABS data are published under CC BY 4.0. This site is an independent
      project and is not affiliated with either agency.
    </p>
  `;

  document.body.append(overlay, modal);

  const close = () => {
    overlay.classList.remove('open');
    modal.classList.remove('open');
  };
  const open = () => {
    overlay.classList.add('open');
    modal.classList.add('open');
    (modal.querySelector('.modal-close') as HTMLElement)?.focus();
  };

  overlay.addEventListener('click', close);
  modal.querySelector('.modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });

  return { open, close };
}
