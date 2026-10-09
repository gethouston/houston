import { deepStrictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { nativeTelemetryTag } from "../src/lib/native-telemetry.ts";

const originalWindow = globalThis.window;
afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    globalThis.window = originalWindow;
  }
});

describe("native telemetry tag", () => {
  it("tags iOS and Android traffic", () => {
    globalThis.window = { __HOUSTON_SURFACE__: "ios" } as Window &
      typeof globalThis;
    deepStrictEqual(nativeTelemetryTag(), { surface: "ios" });
    globalThis.window = { __HOUSTON_SURFACE__: "android" } as Window &
      typeof globalThis;
    deepStrictEqual(nativeTelemetryTag(), { surface: "android" });
  });

  it("keeps browser and desktop events untagged", () => {
    Reflect.deleteProperty(globalThis, "window");
    deepStrictEqual(nativeTelemetryTag(), {});
    globalThis.window = {} as Window & typeof globalThis;
    deepStrictEqual(nativeTelemetryTag(), {});
  });
});
