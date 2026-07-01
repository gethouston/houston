import { afterEach, expect, test } from "vitest";
import { liveToken } from "../src/engine-adapter/control-plane";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

function setEngineToken(token: string): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __HOUSTON_ENGINE__: {
        baseUrl: "https://gateway.example",
        token,
      },
    },
  });
}

test("liveToken falls back to the constructor token outside the app window", () => {
  Reflect.deleteProperty(globalThis, "window");
  expect(liveToken("captured")).toBe("captured");
});

test("liveToken uses the refreshed hosted session token", () => {
  setEngineToken("fresh");
  expect(liveToken("stale")).toBe("fresh");
});

test("liveToken preserves an empty hosted token after sign-out", () => {
  setEngineToken("");
  expect(liveToken("stale")).toBe("");
});
