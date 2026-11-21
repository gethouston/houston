import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type NativeTheme,
  serializeNativeTheme,
} from "../src/lib/theme-native.ts";

class FakeWindow {
  readonly received: NativeTheme[] = [];
  private readonly settlers: ((err?: Error) => void)[] = [];

  setTheme = (theme: NativeTheme): Promise<void> => {
    this.received.push(theme);
    return new Promise((resolve, reject) => {
      this.settlers.push((err) => (err ? reject(err) : resolve()));
    });
  };

  async finish(index: number, err?: Error): Promise<void> {
    const settle = this.settlers[index];
    assert.ok(settle, `call ${index} never reached the window`);
    settle(err);
    await drain();
  }
}

function drain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("serializing the native window theme", () => {
  it("makes a pin issued during a release land after it, never before", async () => {
    const win = new FakeWindow();
    const native = serializeNativeTheme(win.setTheme);

    const release = native(null);
    await drain();
    assert.deepEqual(win.received, [null], "the release is under way");

    const pin = native("dark");
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
