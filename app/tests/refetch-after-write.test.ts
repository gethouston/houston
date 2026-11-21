import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { refetchAfterWrite } from "../src/lib/refetch-after-write.ts";

const KEY = ["channels", "personal"];

function heldFirstRead() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let releaseFirst: (value: string) => void = () => {};
  let reads = 0;
  const observer = new QueryObserver<string>(qc, {
    queryKey: KEY,
    queryFn: () => {
      reads += 1;
      if (reads === 1)
        return new Promise<string>((resolve) => {
          releaseFirst = resolve;
        });
      return Promise.resolve("after the write");
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  return {
    qc,
    reads: () => reads,
    releaseFirst: (value: string) => releaseFirst(value),
    unsubscribe,
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("refetchAfterWrite", () => {
  it("reads again when the write lands during the list's first read", async () => {
    const list = heldFirstRead();
    await settle();
    assert.equal(list.reads(), 1);

    await refetchAfterWrite(list.qc, KEY);
    list.releaseFirst("before the write");
    await settle();

    assert.equal(list.reads(), 2);
    assert.equal(list.qc.getQueryData(KEY), "after the write");
    list.unsubscribe();
  });

  it("reads again after a settled list too", async () => {
    const list = heldFirstRead();
    list.releaseFirst("before the write");
    await settle();

    await refetchAfterWrite(list.qc, KEY);
    await settle();

    assert.equal(list.reads(), 2);
    assert.equal(list.qc.getQueryData(KEY), "after the write");
    list.unsubscribe();
  });

  it("plain invalidation keeps the first read's stale answer", async () => {
    const list = heldFirstRead();
    await settle();

    await Promise.all([
      list.qc.invalidateQueries({ queryKey: KEY }),
      settle().then(() => list.releaseFirst("before the write")),
    ]);
    await settle();

    assert.equal(list.reads(), 1);
    assert.equal(list.qc.getQueryData(KEY), "before the write");
    list.unsubscribe();
  });
});
