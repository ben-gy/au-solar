// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import type { Dataset } from './data';
import type { ViewId } from './types';

export interface ViewContext {
  data: Dataset;
  /** Open the per-postcode drill-down drawer. */
  openPostcode: (pc: string) => void;
  /** Switch the active view tab (used for cross-view links). */
  goTo: (view: ViewId) => void;
}
