import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type NativeTheme,
  serializeNativeTheme,
} from "../src/lib/theme-native.ts";

/**
 * The native window is ONE resource, and two `setTheme` calls in flight can land
 * in either order: picking System and then Dark could leave the window following
 * the OS (the System release, landing last) while the preference and the DOM both
 * read Dark — and a window that follows the OS is exactly what makes `system`
 * resolvable, so the app would answer the OS appearance for the rest of the
 * session. These tests drive the queue with a window that settles its calls by
 * hand, which is what makes an out-of-order completion expressible at all.
 */

/** A window whose `setTheme` only finishes when the test says so. */
class FakeWindow {
  /** The intents the window actually received, in the order it received them. */
  readonly received: NativeTheme[] = [];
  private readonly settlers: ((err?: Error) => void)[] = [];

  setTheme = (theme: NativeTheme): Promise<void> => {
    this.received.push(theme);
    return new Promise((resolve, reject) => {
      this.settlers.push((err) => (err ? reject(err) : resolve()));
    });
  };

  /** Finish the nth call the window received, then let the queue run on. */
  async finish(index: number, err?: Error): Promise<void> {
    const settle = this.settlers[index];
    assert.ok(settle, `call ${index} never reached the window`);
    settle(err);
    await drain();
  }
}

/** Let every queued continuation run. */
function drain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("serializing the native window theme", () => {
  it("makes a pin issued during a release land after it, never before", async () => {
    const win = new FakeWindow();
    const native = serializeNativeTheme(win.setTheme);

    const release = native(null); // System: hand the window back to the OS
    await drain();
    assert.deepEqual(win.received, [null], "the release is under way");

    const pin = native("dark"); // ...and Dark while it is still in flight
    await drain();
    assert.deepEqual(
      win.received,
      [null],
      "the pin waits: issued in parallel, the release could land last",
    );

    await win.finish(0);
    await release;
    assert.deepEqual(
      win.received,
      [null, "dark"],
      "the newest intent reaches the window last, so it is what sticks",
    );
    await win.finish(1);
    await pin;
  });

  it("drops an intent a newer one superseded before it ever started", async () => {
    const win = new FakeWindow();
    const native = serializeNativeTheme(win.setTheme);

    const release = native(null);
    const pin = native("dark");
    await drain();

    assert.deepEqual(
      win.received,
      ["dark"],
      "the release never happens: only the newest intent is worth a call",
    );
    // Nothing failed for the dropped intent — the newer one owns the outcome.
    await release;
    await win.finish(0);
    await pin;
  });

  it("carries a failure to its own caller and keeps the queue flowing", async () => {
    const win = new FakeWindow();
    const native = serializeNativeTheme(win.setTheme);

    const failing = native("dark");
    await drain();
    const later = native(null);

    await win.finish(0, new Error("no window"));
    await assert.rejects(failing, /no window/);
    assert.deepEqual(
      win.received,
      ["dark", null],
      "a rejected call must not swallow every later intent",
    );
    await win.finish(1);
    await later;
  });
});
