import assert from "node:assert/strict";
import test from "node:test";
import { shouldAllowNativeContextMenu } from "./context-menu.ts";

test("allows native context menu for code and form targets", () => {
  const matches = [];
  const target = {
    closest: (selector) => {
      matches.push(selector);
      return {};
    },
  };

  assert.equal(shouldAllowNativeContextMenu(target), true);
  assert.equal(matches[0].includes("pre"), true);
  assert.equal(matches[0].includes("textarea"), true);
});

test("blocks blank native context menu when no selected text or allowed target exists", () => {
  const target = { closest: () => null };
  assert.equal(shouldAllowNativeContextMenu(target), false);
});

test("allows native context menu while text is selected", () => {
  const previous = globalThis.getSelection;
  globalThis.getSelection = () => ({
    isCollapsed: false,
    toString: () => "selected",
  });

  assert.equal(shouldAllowNativeContextMenu(null), true);
  globalThis.getSelection = previous;
});
