import { osIsNativeMobile } from "./os-bridge/platform";

export interface ReservedTab {
  navigate: (url: string) => boolean | Promise<boolean>;
  discard: () => void;
}

export interface TabHandle {
  closed: boolean;
  opener: unknown;
  location: { href: string };
  close: () => void;
}

export type TabOpener = () => TabHandle | null;

const openEmptyTab: TabOpener = () =>
  typeof window === "undefined" ? null : window.open("", "_blank");

export function reserveBrowserTab(
  open: TabOpener = openEmptyTab,
): ReservedTab | null {
  if (osIsNativeMobile()) {
    return {
      navigate: async (url) => {
        const { tauriSystem } = await import("./tauri");
        return tauriSystem.openUrl(url);
      },
      discard: () => {},
    };
  }
  const tab = open();
  if (tab === null) return null;
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
