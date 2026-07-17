import { expect, test } from "vitest";
import { withDocLock } from "./doc-lock";

const tick = () => new Promise((r) => setTimeout(r, 0));

test("same-key writers run strictly one after another", async () => {
  const order: string[] = [];
  const slow = withDocLock("k", async () => {
    order.push("a:start");
    await tick();
    await tick();
    order.push("a:end");
  });
  const fast = withDocLock("k", async () => {
    order.push("b:start");
    order.push("b:end");
  });
  await Promise.all([slow, fast]);
  expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
});

test("different keys never contend", async () => {
  const order: string[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const blocked = withDocLock("k1", async () => {
    await gate;
    order.push("k1");
  });
  await withDocLock("k2", async () => {
    order.push("k2");
  });
  release();
  await blocked;
  expect(order).toEqual(["k2", "k1"]);
});

test("a rejection propagates to its caller but never wedges the chain", async () => {
  const boom = withDocLock("k", async () => {
    throw new Error("boom");
  });
  await expect(boom).rejects.toThrow("boom");
  await expect(withDocLock("k", async () => "after")).resolves.toBe("after");
});
