import { STORE_VIEW_ID } from "../components/store-view/id.ts";
import { useUIStore } from "../stores/ui";
import { reportError } from "./error-toast";
import {
  legacyListen,
  osIsTauri,
  osTakePendingStoreDeepLink,
} from "./os-bridge";
import { parseStoreCreatorHandle } from "./store-creator-handle";
import { parseStoreInstallSlug } from "./store-install-slug";

/** Raw Tauri event the Rust shell emits when it receives a store deep link
 * (`houston://store/install` OR `houston://store/creator`) while the app is
 * already running. One shared channel, disambiguated by URL path frontend-side;
 * fully disjoint from the `auth://deep-link` channel — the two never share
 * state. */
const STORE_DEEP_LINK_EVENT = "store://deep-link";

/** Open the Agent Store on a creator's profile pane. Mirrors how the store's
 * in-app "View profile" affordances navigate: seed the one-shot handle the view
 * consumes, then switch to the store view. Opening a profile is idempotent and
 * side-effect-free (no install, no ping), so a repeat delivery merely
 * re-navigates to the same pane — no drive-style dedup needed. */
function openCreator(handle: string): void {
  const ui = useUIStore.getState();
  ui.setStoreCreatorHandle(handle);
  ui.setViewMode(STORE_VIEW_ID);
}

/** Desktop deep link (full `houston://store/...` URL): the path disambiguates
 * install from creator, so try each parser in turn. Installs queue the pending
 * slug (driven once by `useStoreInstallDeepLink`); creators open the pane. */
function dispatchDeepLink(raw: string): void {
  const slug = parseStoreInstallSlug(raw);
  if (slug) {
    useUIStore.getState().setPendingStoreInstallSlug(slug);
    return;
  }
  const handle = parseStoreCreatorHandle(raw);
  if (handle) openCreator(handle);
}

/** Read the web store params (`?install=<slug>` / `?creator=<handle>`) once,
 * then strip them so a reload does not re-trigger (the pending slug / navigation
 * live only in memory). A bare handle also matches `SLUG_REGEX`, so each param
 * is read explicitly rather than through the path-based desktop dispatcher. */
function drainWebParams(): void {
  const params = new URLSearchParams(window.location.search);
  const install = params.get("install");
  const creator = params.get("creator");
  if (install === null && creator === null) return;
  params.delete("install");
  params.delete("creator");
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  );
  if (install !== null) {
    const slug = parseStoreInstallSlug(install);
    if (slug) useUIStore.getState().setPendingStoreInstallSlug(slug);
  }
  if (creator !== null) {
    const handle = parseStoreCreatorHandle(creator);
    if (handle) openCreator(handle);
  }
}

/**
 * Wire up every store deep-link ingress path and return an unsubscribe. Three
 * paths feed the two actions (install → pending slug; creator → profile pane):
 *  1. Warm desktop: the `store://deep-link` Tauri event fires with the raw URL.
 *  2. Cold desktop: the shell stashed the URL before the webview existed;
 *     `take_pending_store_deep_link` drains it once on mount.
 *  3. Web: `?install` / `?creator` query params, stripped from history so a
 *     reload does not re-trigger.
 */
export function subscribeStoreDeepLinks(): () => void {
  // Warm desktop: the raw URL rides the event payload. The web shim makes
  // `legacyListen` a no-op, so this is harmless in the browser.
  let off: (() => void) | undefined;
  legacyListen<string>(STORE_DEEP_LINK_EVENT, (ev) =>
    dispatchDeepLink(ev.payload),
  )
    .then((fn) => {
      off = fn;
    })
    .catch((err: unknown) => {
      reportError(
        "store_install_deeplink",
        "failed to register store deep-link listener",
        err,
      );
    });

  if (osIsTauri()) {
    // Cold desktop: drain whatever the shell stashed before we could listen.
    osTakePendingStoreDeepLink()
      .then((raw) => {
        if (raw) dispatchDeepLink(raw);
      })
      .catch((err: unknown) => {
        reportError(
          "store_install_deeplink",
          "failed to drain pending store deep-link",
          err,
        );
      });
  } else {
    drainWebParams();
  }

  return () => {
    off?.();
  };
}
