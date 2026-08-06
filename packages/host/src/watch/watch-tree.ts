import {
  type Dirent,
  type FSWatcher,
  readdirSync,
  statSync,
  watch,
} from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { isBenignRecursiveWatchRace } from "./watcher-race";

export type TreeWatchListener = (eventType: string, relPath: string) => void;

/** Minimal shape of `fs.watch` on a single directory — injectable for tests. */
export type WatchDirFn = (
  dir: string,
  cb: (eventType: string, filename: string | Buffer | null) => void,
) => FSWatcher;

export interface TreeWatchOptions {
  /**
   * Called AT MOST ONCE per watcher lifetime, on the first non-transient
   * failure (ENOSPC on the inotify budget is the expected one — HOU-841).
   * After it fires the watcher keeps serving whatever watches it already
   * holds (best-effort); callers with a stronger guarantee need their own
   * fallback (the store-sync daemon's periodic sync).
   */
  onError: (err: unknown) => void;
  /** Test override; defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Test override for the per-directory watch (Linux strategy only). */
  watchDir?: WatchDirFn;
}

export interface TreeWatch {
  close(): void;
}

/**
 * Recursive tree watch without the Linux per-file inotify explosion.
 *
 * macOS/Windows: native `fs.watch(root, { recursive: true })` (FSEvents /
 * ReadDirectoryChangesW) — one OS handle for the whole tree.
 *
 * Linux: Node has no native recursive watch; its userland fallback
 * (`internal/fs/recursive_watch`) registers one inotify watch per FILE and
 * re-registers on every file that appears — atomic-write temp files included.
 * inotify watches are a kernel budget shared by every pod on the node, so a
 * busy tree exhausts it and every later file op throws ENOSPC (HOU-841).
 * A directory inotify watch already reports create/modify/delete of its
 * direct children, so this strategy watches DIRECTORIES only: watch count
 * drops from files+dirs to dirs, and file churn registers nothing new.
 */
export function watchTree(
  root: string,
  listener: TreeWatchListener,
  opts: TreeWatchOptions,
): TreeWatch {
  const platform = opts.platform ?? process.platform;
  if (platform !== "linux") return watchNative(root, listener, opts.onError);
  return new DirTreeWatcher(root, listener, opts.onError, opts.watchDir);
}

function watchNative(
  root: string,
  listener: TreeWatchListener,
  onError: (err: unknown) => void,
): TreeWatch {
  const watcher = watch(root, { recursive: true }, (eventType, filename) => {
    if (filename) listener(eventType, filename.toString());
  });
  let errored = false;
  watcher.on("error", (err) => {
    // Defensive: only a platform on Node's userland fallback produces this
    // race, and those route to DirTreeWatcher above — but a kept watcher
    // beats a spurious degradation if the dispatch ever widens.
    if (isBenignRecursiveWatchRace(err)) return;
    watcher.close();
    if (errored) return;
    errored = true;
    onError(err);
  });
  return { close: () => watcher.close() };
}

class DirTreeWatcher implements TreeWatch {
  private readonly watchers = new Map<string, FSWatcher>();
  private closed = false;
  /** Set on the first failed watch-add: stop consuming budget, keep serving. */
  private degraded = false;
  private errored = false;

  constructor(
    private readonly root: string,
    private readonly listener: TreeWatchListener,
    private readonly onError: (err: unknown) => void,
    private readonly watchDir: WatchDirFn = (dir, cb) => watch(dir, cb),
  ) {
    this.addDir(root, true);
  }

  close(): void {
    this.closed = true;
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
  }

  private reportOnce(err: unknown): void {
    if (this.errored) return;
    this.errored = true;
    this.onError(err);
  }

  private addDir(dir: string, isRoot = false): void {
    if (this.closed || this.degraded || this.watchers.has(dir)) return;
    // .git is never watched: agentFileEventType (packages/domain) already
    // classifies every .git/ path as a null event, so a watch there only
    // spends inotify budget for changes nobody sees. Checked here (not just
    // in the readdir scan below) because a rename event for a pre-existing
    // dir can call addDir directly, bypassing that scan.
    if (!isRoot && basename(dir) === ".git") return;
    let watcher: FSWatcher;
    try {
      watcher = this.watchDir(dir, (eventType, filename) =>
        this.onDirEvent(dir, eventType, filename),
      );
    } catch (err) {
      const isMissing = (err as NodeJS.ErrnoException).code === "ENOENT";
      // Parity with fs.watch: a root that doesn't exist is a caller/setup
      // bug worth failing loudly on. Anything else on root — ENOSPC (the
      // inotify budget is spent) chief among them — degrades exactly like a
      // mid-tree failure below: a crashed pod serves nobody, a pod that boots
      // with no live watching still serves the store-sync daemon's fallback.
      if (isRoot && isMissing) throw err;
      // A dir deleted between the parent event and this watch is the normal
      // transient-dir race (see watcher-race.ts) — just skip it.
      if (!isRoot && isMissing) return;
      this.degraded = true;
      this.reportOnce(err);
      return;
    }
    watcher.on("error", (err) => {
      watcher.close();
      this.watchers.delete(dir);
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        this.reportOnce(err);
      }
    });
    this.watchers.set(dir, watcher);
    // Scan AFTER watching so subdirs created mid-scan surface as events
    // instead of falling in a gap.
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // vanished — its own error handler cleans up
    }
    for (const entry of entries) {
      if (entry.isDirectory()) this.addDir(join(dir, entry.name));
    }
  }

  private onDirEvent(
    dir: string,
    eventType: string,
    filename: string | Buffer | null,
  ): void {
    if (this.closed || !filename) return;
    const abs = join(dir, filename.toString());
    this.listener(eventType, relative(this.root, abs));
    if (eventType !== "rename") return;
    // rename = an entry appeared or disappeared: a new dir needs a watch, a
    // removed dir needs its subtree's watches released.
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {
      // gone already — fall through to the removal branch
    }
    if (isDir) this.addDir(abs);
    else this.removeSubtree(abs);
  }

  private removeSubtree(abs: string): void {
    const prefix = abs + sep;
    for (const [path, watcher] of this.watchers) {
      if (path === abs || path.startsWith(prefix)) {
        watcher.close();
        this.watchers.delete(path);
      }
    }
  }
}
