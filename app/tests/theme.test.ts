import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { systemPrefersDarkAfterRelease } from "../src/lib/theme-boot.ts";

const DARK_QUERY = "(prefers-color-scheme: dark)";

class FakeWebview {
  readonly reads: boolean[] = [];
  private released = false;
  constructor(
    private readonly pinned: boolean,
    private readonly os: boolean,
  ) {
    globalThis.matchMedia = ((query: string) => {
      assert.equal(query, DARK_QUERY);
      const matches = this.released ? this.os : this.pinned;
      this.reads.push(matches);
      return { matches } as MediaQueryList;
    }) as typeof globalThis.matchMedia;
  }
  release = async (): Promise<void> => {
    await Promise.resolve();
    this.released = true;
  };
}

afterEach(() => {
  // @ts-expect-error — tear down the fake between tests.
  globalThis.matchMedia = undefined;
});

describe("resolving the system appearance", () => {
  it("reads the OS only once the window follows it", async () => {
    const webview = new FakeWebview(true, false);
    assert.equal(await systemPrefersDarkAfterRelease(webview.release), false);
    assert.deepEqual(
      webview.reads,
      [false],
      "one read, taken after the release: a read before it answers the pinned mode",
    );
  });

  it("carries the OS answer through when the window was never pinned", async () => {
    const webview = new FakeWebview(true, true);
    assert.equal(await systemPrefersDarkAfterRelease(webview.release), true);
  });

  it("refuses to answer at all when the release fails", async () => {
    const webview = new FakeWebview(true, false);
    await assert.rejects(
      systemPrefersDarkAfterRelease(() =>
        Promise.reject(new Error("no window")),
      ),
      /no window/,
    );
    assert.deepEqual(
      webview.reads,
      [],
      "the pinned answer is worse than no answer: the caller reports instead",
    );
  });

  it("lands on light where matchMedia does not exist, release still awaited", async () => {
    // @ts-expect-error — a non-browser host, e.g. this test runner.
    globalThis.matchMedia = undefined;
    let released = false;
    const prefersDark = await systemPrefersDarkAfterRelease(async () => {
      released = true;
    });
    assert.equal(prefersDark, false);
    assert.equal(released, true);
  });
});

describe("the surface half of the preference", () => {
  const src = readFileSync(
    new URL("../src/lib/theme.ts", import.meta.url),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("stores a pick without painting it", () => {
    assert.match(src, /export function persistThemePreference\(/);
    assert.equal(
      src.match(/applyThemePreference\(/g)?.length,
      1,
      "only the boot read paints: a write that painted its own result would put a superseded pick back on the page when a newer one landed mid-flight",
    );
  });

  it("answers the boot read to whoever is waiting on it, failure included", () => {
    assert.match(
      src,
      /export function themeReady\(\): Promise<ThemePreference \| null>/,
      "a row that mounts mid-read must be able to wait for the saved preference",
    );
    assert.match(src, /settleBoot\(pref\)/, "the read's answer is announced");
    assert.match(
      src,
      /settleBoot\(null\)/,
      "a FAILED read is announced too: a waiter must never be told the defaults are what is saved, and must never hang",
    );
  });
});

describe("the native window the apply path asks for", () => {
  const src = readFileSync(
    new URL("../src/lib/theme-apply.ts", import.meta.url),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("releases the window under system and pins an explicit mode", () => {
    assert.match(
      src,
      /setNativeTheme\(null\)/,
      "`null` is Tauri's follow-the-OS value",
    );
    assert.match(src, /setNativeTheme\(mode\)/);
    assert.match(
      src,
      /followsSystem\(pref\)/,
      "the release is gated on system",
    );
  });

  it("reaches the window ONLY through the serialized slot", () => {
    assert.equal(
      src.match(/getCurrentWindow\(\)/g)?.length,
      1,
      "a second call site could race the slot and leave the window behind",
    );
    assert.match(src, /serializeNativeTheme\(\s*\(theme\) =>/);
  });

  it("reports a failed release instead of swallowing it", () => {
    assert.match(src, /logAndReportError\(\s*"release_window_theme"/);
  });

  it("reports a failed pin too — a title bar stuck on the old mode is a bug", () => {
    assert.match(src, /logAndReportError\(\s*"sync_window_theme"/);
    assert.equal(
      src.match(/\.catch\(\(\) => \{\}\)/g)?.length,
      undefined,
      "neither native call is allowed to swallow its failure",
    );
  });
});
