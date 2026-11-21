import { deepStrictEqual, rejects, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import { serialQueue } from "../src/lib/serial-queue.ts";

function gate() {
  let open = () => {};
  const done = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { done, open };
}

describe("serialQueue", () => {
  it("runs one key's writes in call order, each after the last settles", async () => {
    const queued = serialQueue();
    const order: string[] = [];
    const slow = gate();
    const a = queued("agent", async () => {
      order.push("a:start");
      await slow.done;
      order.push("a:end");
    });
    const b = queued("agent", async () => {
      order.push("b");
    });
    await Promise.resolve();
    deepStrictEqual(order, ["a:start"]);
    slow.open();
    await Promise.all([a, b]);
    deepStrictEqual(order, ["a:start", "a:end", "b"]);
  });

  it("a rejected write reaches its own caller and the next still runs", async () => {
    const queued = serialQueue();
    const first = queued("agent", async () => {
      throw new Error("refused");
    });
    const second = queued("agent", async () => "landed");
    await rejects(first, /refused/);
    strictEqual(await second, "landed");
  });

  it("different keys never wait on each other", async () => {
    const queued = serialQueue();
    const slow = gate();
    const order: string[] = [];
    const a = queued("one", async () => {
      await slow.done;
      order.push("one");
    });
    await queued("two", async () => {
      order.push("two");
    });
    deepStrictEqual(order, ["two"]);
    slow.open();
    await a;
    deepStrictEqual(order, ["two", "one"]);
  });
});
