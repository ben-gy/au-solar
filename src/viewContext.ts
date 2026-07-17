import type { Dataset } from './data';
import type { ViewId } from './types';

export interface ViewContext {
  data: Dataset;
  /** Open the per-postcode drill-down drawer. */
  openPostcode: (pc: string) => void;
  /** Switch the active view tab (used for cross-view links). */
  goTo: (view: ViewId) => void;
}
