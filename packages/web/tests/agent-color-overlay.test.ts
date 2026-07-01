import { expect, test } from "vitest";
import {
  removeColorOverlay,
  renameColorOverlay,
} from "../src/engine-adapter/control-plane";

/**
 * In host mode an agent's color lives in a client-side overlay keyed by
 * agent id. The local store derives an agent's id from its on-disk path
 * (`<Workspace>/<Name>`), so renaming an agent changes its id — the overlay must
 * follow, or the avatar reverts to the default color (the reported bug).
 */
test("rename carries the agent's color to its new id", () => {
  const overlay = { "Home/Bob": "#1b6b3a", "Home/Ada": "#5b21b6" };
  expect(renameColorOverlay(overlay, "Home/Bob", "Home/Robert")).toEqual({
    "Home/Robert": "#1b6b3a",
    "Home/Ada": "#5b21b6",
  });
});

test("rename strands no color under the old id", () => {
  const next = renameColorOverlay(
    { "Home/Bob": "#1b6b3a" },
    "Home/Bob",
    "Home/Robert",
  );
  expect("Home/Bob" in next).toBe(false);
});

test("rename is a no-op when the id is unchanged (stable-id servers)", () => {
  const overlay = { a: "#1b6b3a" };
  expect(renameColorOverlay(overlay, "a", "a")).toBe(overlay);
});

test("rename leaves the overlay untouched when the agent had no color", () => {
  const overlay = { "Home/Ada": "#5b21b6" };
  expect(renameColorOverlay(overlay, "Home/Bob", "Home/Robert")).toBe(overlay);
});

test("delete drops the agent's overlay entry so a reused path-id can't inherit it", () => {
  const overlay = { "Home/Bob": "#1b6b3a", "Home/Ada": "#5b21b6" };
  expect(removeColorOverlay(overlay, "Home/Bob")).toEqual({
    "Home/Ada": "#5b21b6",
  });
});

test("delete is a no-op when the agent had no color", () => {
  const overlay = { "Home/Ada": "#5b21b6" };
  expect(removeColorOverlay(overlay, "Home/Bob")).toBe(overlay);
});
