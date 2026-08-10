import { create } from "zustand";
import {
  type AnalyticsLens,
  DEFAULT_ANALYTICS_LENS,
} from "./org-view-model.ts";

/**
 * The selected Analytics lens, shared between the two components that read it:
 * the drilled-in Admin header (whose lozenges ARE the lens navigation) and the
 * Analytics section body (which mounts only the selected lens). Colocated like
 * `org-nav-store.ts` rather than lifted into the shared UI store — nothing
 * outside Admin cares.
 *
 * Deliberately NOT reset on leaving Analytics: the Admin screen is kept alive,
 * and coming back to the lens you left is the same continuity every top-level
 * screen offers.
 */
interface AnalyticsLensState {
  lens: AnalyticsLens;
  setLens: (lens: AnalyticsLens) => void;
}

export const useAnalyticsLens = create<AnalyticsLensState>((set) => ({
  lens: DEFAULT_ANALYTICS_LENS,
  setLens: (lens) => set({ lens }),
}));
