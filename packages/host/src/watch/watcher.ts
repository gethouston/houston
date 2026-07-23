import type { HoustonEvent } from "@houston/protocol";
import { classifyChange } from "./classify";
import { type TreeWatch, watchTree } from "./watch-tree";

/**
 * Watches the local `~/.houston/workspaces` tree and emits reactivity events for
 * changes — so an agent (or the user) editing files directly shows up in the UI
 * with no write going through the host. The local counterpart of the cloud's
 * post-mutation emits; same HoustonEvent vocabulary, different detection.
 *
 * The recursion strategy (native on macOS/Windows, directory-only inotify on
 * Linux so a busy pod tree cannot exhaust the kernel watch budget — HOU-841)
 * lives in watch-tree.ts.
 *
 * Events are coalesced per (agentPath, type) over a short debounce so a burst of
 * writes (a routine run rewriting several files) yields one invalidation each.
 */
export class FsWatcher {
  private treeWatch: TreeWatch | undefined;
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly root: string,
    private readonly onEvent: (event: HoustonEvent) => void,
    private readonly debounceMs = 300,
  ) {}

  start(): void {
    if (this.treeWatch) return;
    this.treeWatch = watchTree(
      this.root,
      (_type, relPath) => {
        const event = classifyChange(relPath);
        if (event) this.schedule(event);
      },
      {
        // Fires at most once; the watch keeps best-effort coverage after.
        // File-watcher callback = the no-silent-failures policy's one carve-out
        // (no UI thread to toast on): log loudly and stay up.
        onError: (err) =>
          console.error(
            "[fs-watch] tree watch degraded; direct file edits may not refresh the UI until restart:",
            err,
          ),
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
    this.treeWatch?.close();
    this.treeWatch = undefined;
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}
