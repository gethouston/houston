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

  it("reports one fullscreen failure until a successful read resets the latch", async () => {
    let resize: (() => void) | undefined;
    let fail = true;
    const reports: string[] = [];
    const stop = watchFullscreen(
      {
        isFullscreen: async () => {
          if (fail) throw new Error("native window unavailable");
          return false;
        },
        onResized: async (handler) => {
          resize = handler;
          return () => undefined;
        },
      },
      () => undefined,
      (code) => reports.push(code),
    );
    await settle();
    assert.ok(resize);
    resize();
    resize();
    await settle();
    assert.deepEqual(reports, ["window_controls_fullscreen"]);
    fail = false;
    resize();
    await settle();
    fail = true;
    resize();
    await settle();
    assert.deepEqual(reports, [
      "window_controls_fullscreen",
      "window_controls_fullscreen",
    ]);
    stop();
  });

  it("drops a failure that settles after a newer read, so it cannot latch", async () => {
    let rejectFirst: ((err: unknown) => void) | undefined;
    const reads: Array<() => Promise<boolean>> = [
      () =>
        new Promise<boolean>((_, reject) => {
          rejectFirst = reject;
        }),
      async () => false,
    ];
    const current = new Error("current read failed");
    let resize: (() => void) | undefined;
    const reports: unknown[] = [];
    const stop = watchFullscreen(
      {
        isFullscreen: () => {
          const read = reads.shift();
          return read ? read() : Promise.reject(current);
        },
        onResized: async (handler) => {
          resize = handler;
          return () => undefined;
        },
      },
      () => undefined,
      (_code, err) => reports.push(err),
    );
    await settle();
    assert.ok(resize && rejectFirst);
    resize();
    await settle();
    rejectFirst(new Error("stale read failed"));
    await settle();
    resize();
    await settle();
    assert.deepEqual(reports, [current]);
    stop();
  });
});
