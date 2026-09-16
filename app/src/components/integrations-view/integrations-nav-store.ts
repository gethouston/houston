import { create } from "zustand";
import {
  DEFAULT_INTEGRATIONS_TAB,
  type IntegrationsTabId,
} from "./integrations-view-model.ts";

/**
 * Which tab the Integrations screen is open on.
 *
 * Colocated rather than lifted into the shared UI store (`stores/ui`): only
 * this screen and the handful of surfaces that deep-link INTO it care, and the
 * store stays free of every page's internal shape.
 *
 * ONE field, read and written by everyone: the view's own lozenge clicks, the
 * gate fallback, and the deep links that arrive from outside (a finished
 * skill-setup chat's notification opens the Skills tab). A one-shot request
 * pinned beside a private `useState` would be the same truth in two places, and
 * the deep-link callers need to READ the open tab too — the notification leaves
 * a user already standing on Skills alone.
 *
 * The screen is kept alive, so it comes back on the tab it was left on, and the
 * view honors a request that arrives while it is already open for the same
 * reason: there is no second mount to catch it.
 */
interface IntegrationsNavState {
  /** The open tab. */
  tab: IntegrationsTabId;
  /** Open `tab` — every writer, inside the screen and out. */
  requestTab: (tab: IntegrationsTabId) => void;
}

export const useIntegrationsNav = create<IntegrationsNavState>((set) => ({
  tab: DEFAULT_INTEGRATIONS_TAB,
  requestTab: (tab) => set({ tab }),
}));
