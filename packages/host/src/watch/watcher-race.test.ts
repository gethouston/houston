import { describe, expect, it } from "vitest";
import { isBenignRecursiveWatchRace } from "./watcher-race";

/** An ENOENT shaped exactly like the production events (issue 7614029702). */
function recursiveWatchEnoent(): Error {
  const err = new Error(
    "ENOENT: no such file or directory, scandir '/data/workspaces/Personal/Personal Assistant/.houston/runtime/auth.json.lock'",
  ) as NodeJS.ErrnoException;
  err.code = "ENOENT";
  err.syscall = "scandir";
  err.stack = [
    "Error: ENOENT: no such file or directory, scandir '…/auth.json.lock'",
    "    at readdirSync (node:fs:1590:26)",
    "    at #watchFolder (node:internal/fs/recursive_watch:111:24)",
    "    at #watchFolder (node:internal/fs/recursive_watch:132:33)",
    "    at FSWatcher.<anonymous> (node:internal/fs/recursive_watch:191:24)",
  ].join("\n");
  return err;
}

describe("isBenignRecursiveWatchRace", () => {
  it("matches the Linux recursive-watcher ENOENT race", () => {
    expect(isBenignRecursiveWatchRace(recursiveWatchEnoent())).toBe(true);
  });

  it("stays loud for ENOENT from application code", () => {
    const err = new Error(
      "ENOENT: no such file or directory",
    ) as NodeJS.ErrnoException;
    err.code = "ENOENT";
    // A normal stack — no recursive_watch frames.
    expect(isBenignRecursiveWatchRace(err)).toBe(false);
  });

  it("stays loud for non-ENOENT errors inside the watcher", () => {
    const err = recursiveWatchEnoent() as NodeJS.ErrnoException;
    err.code = "EMFILE";
    expect(isBenignRecursiveWatchRace(err)).toBe(false);
  });

  it("stays loud for non-Error values", () => {
    expect(isBenignRecursiveWatchRace("ENOENT string")).toBe(false);
    expect(isBenignRecursiveWatchRace(undefined)).toBe(false);
  });
});
