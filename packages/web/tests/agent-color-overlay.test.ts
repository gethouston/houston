import { expect, test } from "vitest";
import {
  removeColorOverlay,
  renameColorOverlay,
  toUiAgent,
} from "../src/engine-adapter/control-plane";
import { DEFAULT_AGENT_COLOR } from "../src/engine-adapter/synthetic";

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

// ── legacy wire color (Rust-era `.houston/agent.json`, served by the host) ──

const wireAgent = (color?: string) => ({
  id: "Home/Bob",
  workspaceId: "Home",
  name: "Bob",
  createdAt: 0,
  ...(color ? { color } : {}),
});

test("the overlay (the user's current pick) outranks the host's legacy color", () => {
  const ui = toUiAgent(wireAgent("forest"), { "Home/Bob": "#5b21b6" });
  expect(ui.color).toBe("#5b21b6");
});

test("without an overlay entry, the host's legacy Rust-era color is used", () => {
  // Pre-cutover colors lived engine-side (`.houston/agent.json`), so the
  // overlay never held them — falling straight to the default was the
  // everything-turned-purple migration bug.
  const ui = toUiAgent(wireAgent("forest"), {});
  expect(ui.color).toBe("forest");
});

test("no overlay and no legacy color falls back to the default", () => {
  const ui = toUiAgent(wireAgent(), {});
  expect(ui.color).toBe(DEFAULT_AGENT_COLOR);
});
