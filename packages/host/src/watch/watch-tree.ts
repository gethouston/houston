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

export type WatchDirFn = (
  dir: string,
  cb: (eventType: string, filename: string | Buffer | null) => void,
) => FSWatcher;

export interface TreeWatchOptions {
  onError: (err: unknown) => void;
  platform?: NodeJS.Platform;
  watchDir?: WatchDirFn;
  excludeDirs?: string[];
}

export interface TreeWatch {
  close(): void;
}

export function watchTree(
  root: string,
  listener: TreeWatchListener,
  opts: TreeWatchOptions,
): TreeWatch {
  const platform = opts.platform ?? process.platform;
  if (platform !== "linux") return watchNative(root, listener, opts.onError);
  return new DirTreeWatcher(
    root,
    listener,
    opts.onError,
    opts.watchDir,
    opts.excludeDirs,
  );
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
  private degraded = false;
  private errored = false;

  constructor(
    private readonly root: string,
    private readonly listener: TreeWatchListener,
    private readonly onError: (err: unknown) => void,
    private readonly watchDir: WatchDirFn = (dir, cb) => watch(dir, cb),
    private readonly excludeDirs: string[] = [],
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

  private isSkipped(dir: string): boolean {
    return basename(dir) === ".git" || this.excludeDirs.includes(dir);
  }

  private addDir(dir: string, isRoot = false): void {
    if (this.closed || this.degraded || this.watchers.has(dir)) return;
    if (!isRoot && this.isSkipped(dir)) return;
    let watcher: FSWatcher;
    try {
      watcher = this.watchDir(dir, (eventType, filename) =>
        this.onDirEvent(dir, eventType, filename),
      );
    } catch (err) {
      const isMissing = (err as NodeJS.ErrnoException).code === "ENOENT";
      if (isRoot && isMissing) throw err;
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
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
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
    let isDir = false;
    try {
      isDir = statSync(abs).isDirectory();
    } catch {}
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
