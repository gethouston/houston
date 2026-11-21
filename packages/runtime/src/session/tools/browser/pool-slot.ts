import { CLOSE_GRACE_MS, settledWithin } from "./action-deadline";
import { dismissPending } from "./dialogs";
import type { BrowserTab } from "./open-tab";
import { saveState } from "./state-store";
import { closeContext } from "./tab-pages";

export interface Slot {
  statePath: string;
  tab: Promise<BrowserTab> | null;
  spare: Promise<BrowserTab> | null;
  epoch: number;
  chain: Promise<void>;
  pending: number;
  lastUsed: number;
}

export function newSlot(statePath: string): Slot {
  return {
    statePath,
    tab: null,
    spare: null,
    epoch: 0,
    chain: Promise.resolve(),
    pending: 0,
    lastUsed: Date.now(),
  };
}

export async function liveTab(
  slot: Slot,
  openLocal: (statePath: string) => Promise<BrowserTab>,
): Promise<BrowserTab> {
  const tab = await slot.tab?.catch(() => undefined);
  if (tab?.context.browser()?.isConnected()) {
    if (tab.page.isClosed())
      tab.page = tab.context.pages().at(-1) ?? (await tab.context.newPage());
    return tab;
  }
  const opened = openLocal(slot.statePath);
  slot.tab = opened;
  return opened;
}

export async function disposeSlot(slot: Slot): Promise<boolean> {
  const pending = slot.tab;
  slot.tab = null;
  const tab = await pending?.catch(() => undefined);
  return tab ? disposeTab(tab) : true;
}

async function disposeTab(tab: BrowserTab): Promise<boolean> {
  if (!tab.context.browser()?.isConnected()) {
    await tab.backup?.dispose();
    return true;
  }
  const save = async () => {
    await dismissPending(tab);
    await saveState(tab);
  };
  try {
    return await settledWithin(
      save(),
      CLOSE_GRACE_MS,
      "saving sign-ins on close",
    );
  } finally {
    await closeContext(tab);
  }
}
