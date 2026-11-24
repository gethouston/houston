import type { Browser } from "playwright-core";
import { ACTION_DEADLINE_MS, withinDeadline } from "./action-deadline";
import { type BackupBrowser, backupFromEnv } from "./kernel-tab";
import { launchBrowser } from "./launch";
import { LocalBrowser } from "./local-browser";
import { type BrowserTab, openTab } from "./open-tab";
import {
  disposeSlot,
  liveTab,
  newSlot,
  type Slot,
  saveSlot,
} from "./pool-slot";
import { eachSlotUnder } from "./pool-under";
import { maxTabPages } from "./tab-pages";
import { slotSwap, type TabSwap } from "./tab-swap";

export type { BrowserTab } from "./open-tab";
export type { TabSwap } from "./tab-swap";

export interface BrowserPoolOptions {
  launch?: () => Promise<Browser>;
  idleMs?: number;
  maxPages?: number;
  deadlineMs?: number;
  backup?: BackupBrowser | null;
}

export const BROWSER_IDLE_MS = 5 * 60_000;

export class BrowserPool {
  private readonly browser: LocalBrowser;
  private readonly slots = new Map<string, Slot>();
  private sweepTimer: NodeJS.Timeout | null = null;
  private readonly backup: () => BackupBrowser | null;
  private readonly idleMs: number;
  private readonly maxPages: number;
  private readonly deadlineMs: number;

  constructor(options: BrowserPoolOptions = {}) {
    this.browser = new LocalBrowser(options.launch ?? (() => launchBrowser()));
    const given = options.backup ?? null;
    this.backup =
      options.backup !== undefined || options.launch
        ? () => given
        : backupFromEnv(process.env);
    this.idleMs = options.idleMs ?? BROWSER_IDLE_MS;
    this.maxPages = options.maxPages ?? maxTabPages(process.env);
    this.deadlineMs = options.deadlineMs ?? ACTION_DEADLINE_MS;
  }

  run<T>(
    key: string,
    statePath: string,
    fn: (tab: BrowserTab, swap: TabSwap) => Promise<T>,
    signal?: AbortSignal,
    extraMs = 0,
  ): Promise<T> {
    let slot = this.slots.get(key);
    if (!slot) {
      slot = newSlot(statePath);
      this.slots.set(key, slot);
    }
    const queued = slot;
    return this.enqueue(queued, async () => {
      signal?.throwIfAborted();
      const openLocal = (statePath: string) =>
        this.browser.get().then((b) => openTab(b, statePath, this.maxPages));
      const swap = slotSwap(queued, this.backup(), openLocal, this.maxPages);
      const work = liveTab(queued, openLocal).then((tab) => fn(tab, swap));
      return withinDeadline(queued, work, this.deadlineMs + extraMs);
    });
  }

  touch(key: string): void {
    const slot = this.slots.get(key);
    if (slot) slot.lastUsed = Date.now();
  }

  async closeTab(key: string): Promise<boolean> {
    const slot = this.slots.get(key);
    return slot ? this.enqueue(slot, () => disposeSlot(slot)) : true;
  }

  async saveUnder(dir: string): Promise<void> {
    await eachSlotUnder(this.slots, dir, "saving a turn's sign-ins", (slot) =>
      this.enqueue(slot, () => saveSlot(slot)),
    );
  }

  async closeUnder(dir: string): Promise<void> {
    const keys = await eachSlotUnder(
      this.slots,
      dir,
      "closing a turn's browser",
      (slot) => this.enqueue(slot, () => disposeSlot(slot, false)),
    );
    for (const key of keys) {
      const slot = this.slots.get(key);
      if (slot?.pending === 0 && !slot.tab) this.slots.delete(key);
    }
  }

  async shutdown(): Promise<void> {
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
    this.sweepTimer = null;
    const keys = [...this.slots.keys()];
    const results = await Promise.allSettled(keys.map((k) => this.closeTab(k)));
    for (const key of keys) this.slots.delete(key);
    await this.browser.close();
    for (const result of results)
      if (result.status === "rejected")
        console.error("[browser] saving sign-ins failed", result.reason);
  }

  private enqueue<T>(slot: Slot, fn: () => Promise<T>): Promise<T> {
    slot.pending += 1;
    const result = slot.chain.then(fn);
    const done = () => {
      slot.pending -= 1;
      slot.lastUsed = Date.now();
      this.armSweep();
    };
    slot.chain = result.then(done, done);
    return result;
  }

  private armSweep(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      this.sweep().catch((error: unknown) =>
        console.error("[browser] idle close failed", error),
      );
    }, this.idleMs);
    this.sweepTimer.unref();
  }

  private async sweep(): Promise<void> {
    const cutoff = Date.now() - this.idleMs;
    const idle = [...this.slots].filter(
      ([, slot]) => slot.pending === 0 && slot.lastUsed <= cutoff,
    );
    await Promise.all(idle.map(([key]) => this.closeTab(key)));
    for (const [key, slot] of idle)
      if (slot.pending === 0 && !slot.tab) this.slots.delete(key);
    if (this.slots.size === 0) await this.browser.close();
    else this.armSweep();
  }
}

export const sharedBrowserPool = new BrowserPool();

process.once("beforeExit", () => {
  sharedBrowserPool
    .shutdown()
    .catch((error: unknown) =>
      console.error("[browser] exit close failed", error),
    );
});
