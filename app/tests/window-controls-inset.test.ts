import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { watchFullscreen } from "../src/lib/window-fullscreen";

function deferred<T>() {
  let finish: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      assert.ok(finish);
      finish(value);
    },
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("native window fullscreen listener", () => {
  it("reads on mount and follows fullscreen entry and exit on resize", async () => {
    let fullscreen = false;
    let resize: (() => void) | undefined;
    const values: boolean[] = [];
    const stop = watchFullscreen(
      {
        isFullscreen: async () => fullscreen,
        onResized: async (handler) => {
          resize = handler;
          return () => undefined;
        },
      },
      (value) => values.push(value),
      () => assert.fail("unexpected native error"),
    );
    await settle();
    assert.deepEqual(values, [false]);
    assert.ok(resize);
    fullscreen = true;
    resize();
    await settle();
    fullscreen = false;
    resize();
    await settle();
    assert.deepEqual(values, [false, true, false]);
    stop();
  });

  it("ignores an older read after a newer resize response", async () => {
    const first = deferred<boolean>();
    let reads = 0;
    let resize: (() => void) | undefined;
    const values: boolean[] = [];
    const stop = watchFullscreen(
      {
        isFullscreen: () =>
          reads++ === 0 ? first.promise : Promise.resolve(true),
        onResized: async (handler) => {
          resize = handler;
          return () => undefined;
        },
      },
      (value) => values.push(value),
      () => assert.fail("unexpected native error"),
    );
    assert.ok(resize);
    resize();
    await settle();
    first.resolve(false);
    await settle();
    assert.deepEqual(values, [true]);
    stop();
  });

  it("unlistens when registration resolves after disposal", async () => {
    const registration = deferred<() => void>();
    let unlistens = 0;
    const values: boolean[] = [];
    const stop = watchFullscreen(
      {
        isFullscreen: async () => false,
        onResized: () => registration.promise,
      },
      (value) => values.push(value),
      () => assert.fail("unexpected native error"),
    );
    stop();
    registration.resolve(() => {
      unlistens++;
    });
    await settle();
    assert.equal(unlistens, 1);
    assert.deepEqual(values, []);
  });

  it("reports fullscreen and listener failures", async () => {
    const error = new Error("native window unavailable");
    const reports: Array<[string, unknown]> = [];
    watchFullscreen(
      {
        isFullscreen: async () => {
          throw error;
        },
        onResized: async () => {
          throw error;
        },
      },
      () => assert.fail("unexpected fullscreen value"),
      (code, err) => reports.push([code, err]),
    );
    await settle();
    assert.deepEqual(reports, [
      ["window_controls_fullscreen", error],
      ["window_controls_resize", error],
    ]);
  });
});
