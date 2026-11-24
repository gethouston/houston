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
  /** How long an untouched conversation keeps its context open. */
  idleMs?: number;
  /** Pages one conversation may keep open; by default 3 in turn mode, else 8 (tab-pages.ts). */
  maxPages?: number;
  /** One action's time limit (action-deadline.ts); tests shorten it. */
  deadlineMs?: number;
  /**
   * Where a blocked site's page goes (open-fallback.ts). By default Kernel
   * when KERNEL_API_KEY is set; none when `launch` is given (tests).
   */
  backup?: BackupBrowser | null;
}

export const BROWSER_IDLE_MS = 5 * 60_000;

/**
 * ONE browser per runtime process, launched on the first call, and one
 * BrowserContext per conversation so two chats never share a page. Calls for
 * one conversation run in order, so a `close` or an idle sweep never lands in
 * the middle of an action. A context untouched for `idleMs` is saved and
 * closed, and the browser goes with the last one. A browser that crashed, or
 * a page the site closed, is replaced on the next call. A conversation moved
 * to the backup browser owns that remote browser; closing its tab ends it.
 */
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

  /**
   * Run `fn` on `key`'s tab after every earlier call for `key` has finished.
   * A call whose turn was stopped while it queued is dropped, not run. A call
   * past the deadline closes the tab; a hand-off adds the time it waits on
   * the person (`extraMs`), so the steps after still have a bound.
   */
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

  /**
   * Mark `key` as in use without queueing: a person driving the page through
   * the live view acts on it directly while the hand-off holds the queue.
   */
  touch(key: string): void {
    const slot = this.slots.get(key);
    if (slot) slot.lastUsed = Date.now();
  }

  /** Save and close one conversation's context; false when the save did not finish. */
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

  /** Save every context and close the browser. Safe to call twice. */
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
    // The idle close must never be what keeps a finished process alive.
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

/** The process-wide pool every `browser` tool instance shares. */
export const sharedBrowserPool = new BrowserPool();

// Scripts end through beforeExit; a server's SIGTERM path exits hard, and
// Playwright's own exit hook kills the child there (state is already saved).
process.once("beforeExit", () => {
  sharedBrowserPool
    .shutdown()
    .catch((error: unknown) =>
      console.error("[browser] exit close failed", error),
    );
});
