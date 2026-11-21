import type { BackupBrowser } from "./kernel-tab";
import type { BrowserTab } from "./open-tab";
import { disposeSlot, liveTab, type Slot } from "./pool-slot";
import { closeContext } from "./tab-pages";

export interface TabSwap {
  readonly openBackup: ((host: string) => Promise<BrowserTab>) | null;
  adopt(tab: BrowserTab): Promise<void>;
  dropBackup(): Promise<void>;
  reopenLocal(): Promise<BrowserTab>;
}

export class SlotAbandoned extends Error {
  override readonly name = "SlotAbandoned";
}

export function slotSwap(
  slot: Slot,
  backup: BackupBrowser | null,
  openLocal: (statePath: string) => Promise<BrowserTab>,
  maxPages: number,
): TabSwap {
  const epoch = slot.epoch;
  const ensureOwned = () => {
    if (slot.epoch !== epoch) throw new SlotAbandoned();
  };
  let spare: Promise<BrowserTab> | null = null;
  const release = () => {
    if (slot.spare === spare) slot.spare = null;
    spare = null;
  };
  return {
    openBackup: backup
      ? (host) => {
          ensureOwned();
          const opening = backup.open(slot.statePath, maxPages, host);
          spare = opening;
          slot.spare = opening;
          return opening;
        }
      : null,
    async adopt(tab) {
      ensureOwned();
      const replaced = slot.tab;
      slot.tab = Promise.resolve(tab);
      release();
      const old = await replaced?.catch(() => undefined);
      if (old && old !== tab) await closeContext(old);
    },
    async dropBackup() {
      const mine = spare;
      release();
      const tab = await mine?.catch(() => undefined);
      if (tab) await closeContext(tab);
    },
    async reopenLocal() {
      ensureOwned();
      await disposeSlot(slot);
      ensureOwned();
      return liveTab(slot, openLocal);
    },
  };
}
