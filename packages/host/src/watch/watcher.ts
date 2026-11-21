import type { HoustonEvent } from "@houston/protocol";
import { classifyChange } from "./classify";
import { type TreeWatch, watchTree } from "./watch-tree";

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
        onError: (err) =>
          console.error(
            "[fs-watch] tree watch degraded; direct file edits may not refresh the UI until restart:",
            err,
          ),
      },
    );
  }

  private schedule(event: HoustonEvent): void {
    const scope =
      "agentPath" in event
        ? event.agentPath
        : "workspaceId" in event
          ? event.workspaceId
          : "";
    const key = `${event.type}:${scope}`;
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
