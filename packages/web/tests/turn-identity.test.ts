import { expect, test } from "vitest";
import {
  classifyFrame,
  classifyRunningSync,
} from "../src/engine-adapter/turn-identity";

/** The sink's turn-boundary decision table — see turn-identity.ts. */

test("classifyFrame: an unstamped frame is ours (legacy best-effort continuation)", () => {
  expect(classifyFrame(undefined, undefined)).toBe("ours");
  expect(classifyFrame("t-1", undefined)).toBe("ours");
});

test("classifyFrame: a stamped frame before we know our turn is foreign", () => {
  expect(classifyFrame(undefined, "t-1")).toBe("foreign");
});

test("classifyFrame: same turnId is ours; a different one is a turn boundary", () => {
  expect(classifyFrame("t-1", "t-1")).toBe("ours");
  expect(classifyFrame("t-1", "t-2")).toBe("boundary");
});

test("classifyRunningSync: an unstamped running sync is ours (legacy)", () => {
  expect(classifyRunningSync(undefined, undefined, false)).toBe("ours");
  expect(classifyRunningSync("t-1", undefined, true)).toBe("ours");
});

test("classifyRunningSync: unknown own id adopts only when allowed (observer / post-send)", () => {
  expect(classifyRunningSync(undefined, "t-1", true)).toBe("adopt");
  // Pre-send, a running turn belongs to another writer: never splice it.
  expect(classifyRunningSync(undefined, "t-1", false)).toBe("foreign");
});

test("classifyRunningSync: same id continues; a different id is a boundary", () => {
  expect(classifyRunningSync("t-1", "t-1", true)).toBe("ours");
  expect(classifyRunningSync("t-1", "t-2", true)).toBe("boundary");
});
