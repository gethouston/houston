import {
  type FSWatcher,
  mkdirSync,
  mkdtempSync,
  watch,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { type TreeWatch, type WatchDirFn, watchTree } from "./watch-tree";

/**
 * The Linux directory-only strategy, exercised on any platform by forcing
 * `platform: "linux"` — per-directory `fs.watch` is portable even though the
 * strategy only ships on Linux (HOU-841).
 */

function linuxWatch(
  root: string,
  events: Array<{ type: string; rel: string }>,
  onError: (err: unknown) => void = () => {},
  watchDir?: WatchDirFn,
): TreeWatch {
  return watchTree(root, (type, rel) => events.push({ type, rel }), {
    onError,
    platform: "linux",
    watchDir,
  });
}

async function waitFor(
  predicate: () => boolean,
  budgetMs = 3000,
): Promise<void> {
  const deadline = Date.now() + budgetMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

test("a write deep in the tree surfaces with a root-relative path", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-tree-"));
  mkdirSync(join(root, "Work", "Sales", ".houston"), { recursive: true });
  const events: Array<{ type: string; rel: string }> = [];
  const watcher = linuxWatch(root, events);
  try {
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(join(root, "Work", "Sales", ".houston", "a.json"), "{}");
    const expected = join("Work", "Sales", ".houston", "a.json");
    await waitFor(() => events.some((e) => e.rel === expected));
    expect(events.map((e) => e.rel)).toContain(expected);
  } finally {
    watcher.close();
  }
});

test("a directory created after start is watched too", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-tree-"));
  const events: Array<{ type: string; rel: string }> = [];
  const watcher = linuxWatch(root, events);
  try {
    await new Promise((r) => setTimeout(r, 100));
    mkdirSync(join(root, "late", "nested"), { recursive: true });
    // Wait until the new dirs are armed, then write inside the deepest one.
    await waitFor(() => events.some((e) => e.rel === join("late", "nested")));
    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(join(root, "late", "nested", "file.txt"), "x");
    const expected = join("late", "nested", "file.txt");
    await waitFor(() => events.some((e) => e.rel === expected));
    expect(events.map((e) => e.rel)).toContain(expected);
  } finally {
    watcher.close();
  }
});

test("an exhausted watch budget degrades once and keeps existing coverage", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-tree-"));
  mkdirSync(join(root, "sub-a"));
  mkdirSync(join(root, "sub-b"));
  const onError = vi.fn();
  // The root watch succeeds; every further add hits the ENOSPC the kernel
  // throws when the inotify budget is spent.
  let calls = 0;
  const watchDir: WatchDirFn = (dir, cb) => {
    calls += 1;
    if (calls > 1) {
      throw Object.assign(new Error("ENOSPC: watchers exhausted"), {
        code: "ENOSPC",
      });
    }
    return watch(dir, cb);
  };
  const events: Array<{ type: string; rel: string }> = [];
  const watcher = linuxWatch(root, events, onError, watchDir);
  try {
    expect(onError).toHaveBeenCalledTimes(1);
    // Later renames re-attempt addDir; the degraded flag must not re-report.
    await new Promise((r) => setTimeout(r, 100));
    mkdirSync(join(root, "sub-c"));
    writeFileSync(join(root, "root-file.txt"), "x");
    await waitFor(() => events.some((e) => e.rel === "root-file.txt"));
    expect(events.map((e) => e.rel)).toContain("root-file.txt");
    expect(onError).toHaveBeenCalledTimes(1);
  } finally {
    watcher.close();
  }
});

test("close() halts delivery", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-tree-"));
  const events: Array<{ type: string; rel: string }> = [];
  const watcher = linuxWatch(root, events);
  watcher.close();
  writeFileSync(join(root, "file.txt"), "x");
  await new Promise((r) => setTimeout(r, 200));
  expect(events).toHaveLength(0);
});

test("an unwatchable root throws to the caller", () => {
  const missing = join(mkdtempSync(join(tmpdir(), "houston-tree-")), "nope");
  expect(() => linuxWatch(missing, [])).toThrow();
});

test("a removed subtree releases its watchers", async () => {
  const root = mkdtempSync(join(tmpdir(), "houston-tree-"));
  mkdirSync(join(root, "gone", "deep"), { recursive: true });
  const opened = new Map<string, FSWatcher>();
  const watchDir: WatchDirFn = (dir, cb) => {
    const w = watch(dir, cb);
    opened.set(dir, w);
    return w;
  };
  const closeSpies = () =>
    [...opened.entries()].filter(([, w]) => {
      // FSWatcher has no public "closed" flag; track via patched close.
      return (w as unknown as { __closed?: boolean }).__closed === true;
    });
  const events: Array<{ type: string; rel: string }> = [];
  const watcher = linuxWatch(
    root,
    events,
    () => {},
    (dir, cb) => {
      const w = watchDir(dir, cb);
      const origClose = w.close.bind(w);
      w.close = () => {
        (w as unknown as { __closed?: boolean }).__closed = true;
        return origClose();
      };
      return w;
    },
  );
  try {
    await new Promise((r) => setTimeout(r, 100));
    const { rmSync } = await import("node:fs");
    rmSync(join(root, "gone"), { recursive: true, force: true });
    await waitFor(() =>
      closeSpies().some(([dir]) => dir === join(root, "gone")),
    );
    expect(closeSpies().map(([dir]) => dir)).toEqual(
      expect.arrayContaining([join(root, "gone"), join(root, "gone", "deep")]),
    );
  } finally {
    watcher.close();
  }
});
