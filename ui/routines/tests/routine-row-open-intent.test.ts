import { strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { clickOpensRow, keyOpensRow } from "../src/routine-row-open-intent.ts";

function row(children: object[]) {
  return {
    contains: (node: unknown) =>
      node !== null && children.includes(node as object),
  } as unknown as Node;
}

describe("clickOpensRow", () => {
  it("opens on a click inside the row", () => {
    const inner = {} as EventTarget;
    strictEqual(clickOpensRow(row([inner]), inner), true);
  });

  it("ignores a click from a PORTALED child (kebab item, confirm dialog)", () => {
    const portaled = {} as EventTarget;
    strictEqual(clickOpensRow(row([]), portaled), false);
  });

  it("ignores a missing target", () => {
    strictEqual(clickOpensRow(row([]), null), false);
  });
});

describe("keyOpensRow", () => {
  const self = {} as EventTarget;
  const control = {} as EventTarget;

  it("opens on Enter and Space from the row itself", () => {
    strictEqual(keyOpensRow("Enter", self, self), true);
    strictEqual(keyOpensRow(" ", self, self), true);
  });

  it("ignores every other key", () => {
    strictEqual(keyOpensRow("Escape", self, self), false);
    strictEqual(keyOpensRow("a", self, self), false);
  });

  it("ignores Space from a focused inner control (it toggles the switch)", () => {
    strictEqual(keyOpensRow(" ", control, self), false);
    strictEqual(keyOpensRow("Enter", control, self), false);
  });
});
