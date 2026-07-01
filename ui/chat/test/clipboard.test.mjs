import assert from "node:assert/strict";
import test from "node:test";
import { copyTextToClipboard } from "../src/clipboard.ts";

test("copyTextToClipboard uses async Clipboard API when available", async () => {
  const writes = [];
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { clipboard: { writeText: async (text) => writes.push(text) } },
  });

  await copyTextToClipboard("hello");

  assert.deepEqual(writes, ["hello"]);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: previousNavigator,
  });
});

test("copyTextToClipboard falls back when Clipboard API rejects", async () => {
  const calls = [];
  const previousNavigator = globalThis.navigator;
  const previousDocument = globalThis.document;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    },
  });
  globalThis.document = {
    body: {
      appendChild: (node) => calls.push(["append", node.value]),
      removeChild: (node) => calls.push(["remove", node.value]),
    },
    createElement: () => ({
      style: {},
      setAttribute: () => {},
      focus: () => calls.push(["focus"]),
      select: () => calls.push(["select"]),
    }),
    execCommand: (command) => {
      calls.push(["exec", command]);
      return true;
    },
    getSelection: () => null,
  };

  await copyTextToClipboard("fallback");

  assert.deepEqual(calls, [
    ["append", "fallback"],
    ["focus"],
    ["select"],
    ["exec", "copy"],
    ["remove", "fallback"],
  ]);
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: previousNavigator,
  });
  globalThis.document = previousDocument;
});
