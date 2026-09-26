import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { createAgentLoadOrder } from "../src/lib/agent-load-order.ts";

describe("roster load order", () => {
  it("applies only the newest load", () => {
    const order = createAgentLoadOrder();
    const older = order.begin(false);
    const newer = order.begin(true);
    strictEqual(order.settle(newer), "apply");
    strictEqual(order.settle(older), "drop");
  });

  it("settles the loading flag of a visible load a mutation invalidated", () => {
    const order = createAgentLoadOrder();
    const load = order.begin(false);
    order.invalidate();
    strictEqual(order.settle(load), "drop-and-settle");
  });

  it("leaves the flag to any newer load still in flight", () => {
    for (const silent of [true, false]) {
      const order = createAgentLoadOrder();
      const older = order.begin(false);
      order.begin(silent);
      strictEqual(order.settle(older), "drop");
    }
  });

  it("never settles for a superseded silent load", () => {
    const order = createAgentLoadOrder();
    const silent = order.begin(true);
    order.invalidate();
    strictEqual(order.settle(silent), "drop");
  });
});
