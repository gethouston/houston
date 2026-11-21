import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import { landStream } from "./land-file";
import { closePrivateDir, mkdirForLanding } from "./private-paths";

const posixOnly = process.platform === "win32" ? describe.skip : describe;

function agent() {
  const root = mkdtempSync(join(tmpdir(), "houston-private-"));
  const houston = join(root, ".houston");
  mkdirSync(houston);
  return {
    root,
    browser: join(houston, "browser"),
    state: join(houston, "browser", "state.json"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

posixOnly("a private directory the tool user could have planted", () => {
  test("a symlinked .houston/browser is refused: nothing lands at its target", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { browser, state } = agent();
    const elsewhere = mkdtempSync(join(tmpdir(), "houston-catch-"));
    chmodSync(elsewhere, 0o775);
    symlinkSync(elsewhere, browser);
    expect(await mkdirForLanding(state)).toBe(false);
    expect(
      await landStream(() => Readable.from(['{"cookies":[]}']), state),
    ).toBe(false);
    expect(() => statSync(join(elsewhere, "state.json"))).toThrow();
    expect(statSync(elsewhere).mode & 0o777).toBe(0o775);
    expect(error.mock.calls[0]?.[0]).toMatch(
      /refusing.*browser (is a symlink|is not a directory)/,
    );
  });

  test("a file in place of the directory is refused", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { browser, state } = agent();
    writeFileSync(browser, "");
    expect(await closePrivateDir(state)).toBe(false);
  });

  test("a directory another user owns is refused, never chmodded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { browser, state } = agent();
    mkdirSync(browser, { mode: 0o775 });
    const someoneElse = (process.getuid?.() ?? 0) + 1;
    expect(await closePrivateDir(state, someoneElse)).toBe(false);
    expect(statSync(browser).mode & 0o777).not.toBe(0o700);
    expect(error.mock.calls[0]?.[0]).toMatch(/is owned by uid/);
  });

  test.skipIf(process.getuid?.() === 0)(
    "a directory this process cannot open is refused, not a crash",
    async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { browser, state } = agent();
      mkdirSync(browser, { mode: 0o000 });
      try {
        expect(await closePrivateDir(state)).toBe(false);
      } finally {
        chmodSync(browser, 0o700);
      }
    },
  );

  test("this process's own directory is closed and written", async () => {
    const { browser, state } = agent();
    mkdirSync(browser, { mode: 0o775 });
    expect(await landStream(() => Readable.from(["{}"]), state)).toBe(true);
    expect(statSync(browser).mode & 0o777).toBe(0o700);
    expect(statSync(state).mode & 0o777).toBe(0o600);
  });

  test("a symlink planted at the file itself is replaced, never written through", async () => {
    const { browser, state } = agent();
    mkdirSync(browser, { mode: 0o700 });
    const decoy = join(mkdtempSync(join(tmpdir(), "houston-decoy-")), "x");
    writeFileSync(decoy, "untouched");
    symlinkSync(decoy, state);
    expect(await landStream(() => Readable.from(["{}"]), state)).toBe(true);
    expect(readFileSync(decoy, "utf8")).toBe("untouched");
    expect(lstatSync(state).isSymbolicLink()).toBe(false);
    expect(readFileSync(state, "utf8")).toBe("{}");
  });
});
