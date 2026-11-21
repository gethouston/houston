import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { browserStatePath, readState } from "./state-store";

const posixOnly = process.platform === "win32" ? describe.skip : describe;
const SAVED = JSON.stringify({ cookies: [], origins: [] });

function savedState(): string {
  const dir = mkdtempSync(join(tmpdir(), "browser-refusal-"));
  const path = browserStatePath(dir);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, SAVED);
  return path;
}

afterEach(() => {
  vi.restoreAllMocks();
});

posixOnly("reading sign-ins from a directory the tool user planted", () => {
  test("a directory this process owns is read", async () => {
    expect(await readState(savedState())).toEqual(JSON.parse(SAVED));
  });

  test("another user's directory reads as no saved state, logged once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const path = savedState();
    const uid = process.getuid?.() ?? 0;
    const posix = process as { getuid: () => number };
    vi.spyOn(posix, "getuid").mockReturnValue(uid + 1);
    expect(await readState(path)).toBeUndefined();
    expect(await readState(path)).toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]?.[0]).toMatch(
      /not reading sign-in state: .*browser is owned by uid/,
    );
  });

  test("a symlinked directory is never read through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const elsewhere = dirname(savedState());
    const dir = mkdtempSync(join(tmpdir(), "browser-refusal-"));
    mkdirSync(join(dir, ".houston"));
    symlinkSync(elsewhere, join(dir, ".houston", "browser"));
    expect(await readState(browserStatePath(dir))).toBeUndefined();
  });

  test("no directory at all is simply no saved state", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), "browser-refusal-"));
    expect(await readState(browserStatePath(dir))).toBeUndefined();
    expect(error).not.toHaveBeenCalled();
  });
});
