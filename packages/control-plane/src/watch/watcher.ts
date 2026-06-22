import { type FSWatcher, watch } from "node:fs";
import type { HoustonEvent } from "@houston/protocol";
import { classifyChange } from "./classify";

/**
 * Watches the local `~/.houston/workspaces` tree and emits reactivity events for
 * changes — so an agent (or the user) editing files directly shows up in the UI
 * with no write going through the host. The local counterpart of the cloud's
 * post-mutation emits; same HoustonEvent vocabulary, different detection.
 *
 * Events are coalesced per (agentPath, type) over a short debounce so a burst of
 * writes (a routine run rewriting several files) yields one invalidation each.
 */
export class FsWatcher {
  private fsWatcher: FSWatcher | undefined;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly root: string,
    private readonly onEvent: (event: HoustonEvent) => void,
    private readonly debounceMs = 300,
  ) {}

  start(): void {
    if (this.fsWatcher) return;
    // Recursive watch (supported on macOS + Windows + Bun on Linux). A missing
    // root simply yields no events until the supervisor creates it.
    this.fsWatcher = watch(
      this.root,
      { recursive: true },
      (_type, filename) => {
        if (!filename) return;
        const event = classifyChange(filename.toString());
        if (event) this.schedule(event);
      },
    );
  }

  private schedule(event: HoustonEvent): void {
    const key = `${event.type}:${"agentPath" in event ? event.agentPath : ""}`;
    const existing = this.pending.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pending.delete(key);
      this.onEvent(event);
    }, this.debounceMs);
    timer.unref?.();
    this.pending.set(key, timer);
  }

  stop(): void {
    this.fsWatcher?.close();
    this.fsWatcher = undefined;
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}
