/**
 * A browser tab claimed INSIDE a user gesture, to be pointed at a URL that is
 * only known after an async hop.
 *
 * Safari, Firefox, and Chrome under its strict popup setting honor
 * `window.open` only while the click's user activation is live: an open issued
 * after an `await` (the OAuth link the host has to mint first) is refused
 * silently, and the row claims a tab the user never saw. Opening an EMPTY tab
 * synchronously in the click and navigating it once the link arrives keeps
 * the open inside the gesture.
 *
 * Web only by construction: the caller gates on the shell. The desktop app
 * hands URLs to the OS browser natively and never needs a reservation.
 */
export interface ReservedTab {
  /**
   * Point the tab at `url`. `false` when the user already closed the empty tab
   * while the link was minting, so the caller must fall back to a plain open.
   */
  navigate: (url: string) => boolean;
  /** Close the tab if it never received a URL (the link never came). */
  discard: () => void;
}

/** The slice of a `WindowProxy` a reservation touches; injectable for tests. */
export interface TabHandle {
  closed: boolean;
  opener: unknown;
  location: { href: string };
  close: () => void;
}

/** Opens an empty tab. `null` means the browser refused (popup blocker). */
export type TabOpener = () => TabHandle | null;

const openEmptyTab: TabOpener = () =>
  typeof window === "undefined" ? null : window.open("", "_blank");

/**
 * Claim a tab now. Returns `null` when the browser refused even the
 * synchronous open (a strict blocker, or a call made outside any gesture);
 * the caller then opens normally and reads that open's own verdict.
 */
export function reserveBrowserTab(
  open: TabOpener = openEmptyTab,
): ReservedTab | null {
  const tab = open();
  if (tab === null) return null;
  // Sever the opener link BEFORE any page loads in the tab — the same
  // tabnabbing protection `noopener` gives a direct open, which cannot be
  // used here because `noopener` makes `window.open` return null.
  tab.opener = null;
  let navigated = false;
  return {
    navigate: (url) => {
      if (tab.closed) return false;
      tab.location.href = url;
      navigated = true;
      return true;
    },
    discard: () => {
      if (!navigated && !tab.closed) tab.close();
    },
  };
}
