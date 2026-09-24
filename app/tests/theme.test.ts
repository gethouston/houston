import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { systemPrefersDarkAfterRelease } from "../src/lib/theme-boot.ts";

/**
 * `system` follows the OS only while the NATIVE WINDOW does.
 *
 * WKWebView derives `prefers-color-scheme` from the Tauri window's appearance,
 * so a window pinned to light or dark makes `matchMedia` answer that pinned mode
 * and stops the OS change event arriving: `system` then wears whichever mode was
 * picked last instead of following macOS. Two halves prevent it, one test group
 * each:
 *
 *  - the OS appearance is read only AFTER the window has been handed back
 *    (`systemPrefersDarkAfterRelease`, exercised against a fake webview);
 *  - the apply path passes `null` to release it, reaches the window through the
 *    serialized slot alone (`theme-native.test.ts` drives that slot's ordering),
 *    and reports either native call failing. That module reaches
 *    `@tauri-apps/api/window` and the Sentry / PostHog reporters, which only the
 *    bundler resolves, so it is asserted on source text, the same reason
 *    `os-bridge-barrel.test.ts` reads source.
 */

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * A `matchMedia` standing in for the webview: it answers whatever the native
 * window is pinned to, and tells the truth about the OS only once released. Every
 * answer is recorded, so a read taken before the release is visible to the test.
 */
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
  /** The native release: a round trip, so the window follows the OS a tick later. */
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

describe("the native window the apply path asks for", () => {
  // CODE only: the module's own comments spell these calls out, so asserting on
  // the raw file would pass on a comment while the call said something else.
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
