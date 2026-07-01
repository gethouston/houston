import { strictEqual, notStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { Root } from "react-dom/client";
import { getOrCreateRoot } from "../src/lib/react-root.ts";

// getOrCreateRoot only ever reads/writes the __houstonRoot property and never
// touches real DOM, so a bare object is a faithful stand-in for the container
// node — letting us exercise the guard under node:test without a DOM.
type Container = Parameters<typeof getOrCreateRoot>[0];
function fakeContainer(): Container {
  return {} as unknown as Container;
}

// A factory that hands back a fresh sentinel "root" and counts its own calls,
// standing in for react-dom's createRoot so the test never mounts React.
function countingFactory() {
  let calls = 0;
  const create = () => {
    calls += 1;
    return { id: calls } as unknown as Root;
  };
  return { create, calls: () => calls };
}

describe("getOrCreateRoot (HOU-459 double-createRoot guard)", () => {
  it("creates the root once per container and reuses it on repeat calls", () => {
    const container = fakeContainer();
    const factory = countingFactory();

    const first = getOrCreateRoot(container, factory.create);
    const second = getOrCreateRoot(container, factory.create);
    const third = getOrCreateRoot(container, factory.create);

    // The whole point: a second/third evaluation of the entry module must NOT
    // mint a competing root on the same node (that is what desyncs #root and
    // throws "Failed to execute 'removeChild' on 'Node'").
    strictEqual(factory.calls(), 1, "createRoot must run exactly once per container");
    strictEqual(first, second);
    strictEqual(second, third);
  });

  it("caches the root on the container node", () => {
    const container = fakeContainer();
    const factory = countingFactory();

    const root = getOrCreateRoot(container, factory.create);

    strictEqual((container as { __houstonRoot?: Root }).__houstonRoot, root);
  });

  it("mints a distinct root for each distinct container", () => {
    const factory = countingFactory();

    const a = getOrCreateRoot(fakeContainer(), factory.create);
    const b = getOrCreateRoot(fakeContainer(), factory.create);

    strictEqual(factory.calls(), 2);
    notStrictEqual(a, b);
  });
});
