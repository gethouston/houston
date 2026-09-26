import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SidebarLayout } from "@houston/engine-adapter";
import {
  MutationObserver,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import {
  applySidebarLayoutOp,
  sidebarLayoutRefetchDeferred,
  sidebarLayoutWriteOptions,
} from "../src/hooks/sidebar-layout-writes.ts";
import { queryKeys } from "../src/lib/query-keys.ts";

const WS = "ws";
const key = queryKeys.sidebarLayout(WS);
const agents = (...ids: string[]): SidebarLayout => ({
  groups: [],
  order: ids.map((id) => ({ kind: "agent", id })),
});
const ids = (layout: SidebarLayout | undefined) =>
  layout?.order.map((entry) => entry.id).join(",");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const reported: string[] = [];
const report = (command: string) => {
  reported.push(command);
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A server holding one document, whose PUTs complete only when released. */
function harness(initial: SidebarLayout) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let stored = initial;
  let reads = 0;
  const puts: { layout: SidebarLayout; done: ReturnType<typeof deferred> }[] =
    [];
  const read = deferred<void>();
  let holdRead = false;
  const observer = new QueryObserver(qc, {
    queryKey: key,
    queryFn: async () => {
      reads += 1;
      const snapshot = stored;
      if (holdRead) await read.promise;
      return snapshot;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const options = sidebarLayoutWriteOptions(
    qc,
    WS,
    async (layout) => {
      const done = deferred();
      puts.push({ layout, done });
      await done.promise;
      stored = layout;
    },
    report,
  );
  const move = (next: SidebarLayout) => {
    const write = applySidebarLayoutOp(qc, WS, () => next, report);
    assert.ok(write);
    return new MutationObserver(qc, options)
      .mutate(write)
      .catch(() => undefined);
  };
  return {
    qc,
    puts,
    move,
    reads: () => reads,
    holdNextRead: () => {
      holdRead = true;
    },
    releaseRead: () => read.resolve(),
    stop: unsubscribe,
  };
}

describe("sidebar layout writes", () => {
  it("refuses an edit before this workspace has a successful layout read", () => {
    const qc = new QueryClient();
    const reports: string[] = [];
    let applied = false;
    const write = applySidebarLayoutOp(
      qc,
      WS,
      () => {
        applied = true;
        return agents("replacement");
      },
      (command) => reports.push(command),
    );
    assert.equal(write, null);
    assert.equal(applied, false);
    assert.equal(qc.getQueryData(key), undefined);
    assert.equal(
      applySidebarLayoutOp(
        qc,
        WS,
        () => agents("replacement"),
        (command) => reports.push(command),
      ),
      null,
    );
    assert.deepEqual(reports, ["sidebar_layout_not_ready"]);
  });
  it("sends overlapping writes one at a time, in order", async () => {
    const h = harness(agents("a", "b", "c"));
    await flush();
    const first = h.move(agents("b", "a", "c"));
    const second = h.move(agents("b", "c", "a"));
    await flush();
    assert.equal(h.puts.length, 1, "the second write waits for the first");
    h.puts[0].done.resolve(undefined);
    await flush();
    assert.equal(h.puts.length, 2);
    assert.equal(ids(h.puts[1].layout), "b,c,a");
    h.puts[1].done.resolve(undefined);
    await Promise.all([first, second]);
    await flush();
    assert.equal(ids(h.qc.getQueryData(key)), "b,c,a");
    h.stop();
  });

  it("never paints a re-read that predates a pending write", async () => {
    const h = harness(agents("a", "b", "c"));
    await flush();
    const readsBefore = h.reads();
    const first = h.move(agents("b", "a", "c"));
    const second = h.move(agents("b", "c", "a"));
    await flush();
    assert.equal(sidebarLayoutRefetchDeferred(h.qc, key), true);
    h.puts[0].done.resolve(undefined);
    await flush();
    assert.equal(h.reads(), readsBefore, "no re-read while a write is pending");
    assert.equal(ids(h.qc.getQueryData(key)), "b,c,a");
    h.puts[1].done.resolve(undefined);
    await Promise.all([first, second]);
    await flush();
    assert.equal(h.reads(), readsBefore + 1, "one re-read after the last");
    assert.equal(sidebarLayoutRefetchDeferred(h.qc, key), false);
    assert.equal(ids(h.qc.getQueryData(key)), "b,c,a");
    h.stop();
  });

  it("cancels a re-read already in flight when a write starts", async () => {
    const h = harness(agents("a", "b", "c"));
    await flush();
    h.holdNextRead();
    const stale = h.qc.refetchQueries({ queryKey: key });
    const write = h.move(agents("c", "b", "a"));
    h.releaseRead();
    await stale;
    assert.equal(ids(h.qc.getQueryData(key)), "c,b,a");
    h.puts[0].done.resolve(undefined);
    await write;
    h.stop();
  });

  it("rolls back only when the failed write is the last one pending", async () => {
    const h = harness(agents("a", "b"));
    await flush();
    const first = h.move(agents("b", "a"));
    const second = h.move(agents("a", "b", "x"));
    await flush();
    h.puts[0].done.reject(new Error("refused"));
    await flush();
    assert.equal(ids(h.qc.getQueryData(key)), "a,b,x", "later write kept");
    h.puts[1].done.reject(new Error("refused"));
    await Promise.all([first, second]);
    await flush();
    assert.equal(ids(h.qc.getQueryData(key)), "a,b", "server truth after all");
    h.stop();
  });

  it("rolls back past every failed write to the last successful state", async () => {
    const h = harness(agents("a", "b"));
    await flush();
    const first = h.move(agents("b", "a"));
    const second = h.move(agents("a", "b", "x"));
    await flush();
    h.puts[0].done.reject(new Error("refused"));
    await flush();
    h.holdNextRead();
    h.puts[1].done.reject(new Error("refused"));
    await Promise.all([first, second]);
    assert.equal(
      ids(h.qc.getQueryData(key)),
      "a,b",
      "no failed write stays on screen while the re-read runs",
    );
    h.releaseRead();
    await flush();
    h.stop();
  });

  it("writes nothing for an op that changes nothing", async () => {
    const h = harness(agents("a", "b"));
    await flush();
    const before = h.qc.getQueryData(key);
    let cancelled = 0;
    const cancel = h.qc.cancelQueries.bind(h.qc);
    h.qc.cancelQueries = (...args) => {
      cancelled += 1;
      return cancel(...args);
    };
    assert.equal(
      applySidebarLayoutOp(h.qc, WS, (current) => current, report),
      null,
    );
    assert.equal(h.qc.getQueryData(key), before);
    assert.equal(cancelled, 0);
    h.stop();
  });

  it("reports nothing on the happy path", () => {
    assert.deepEqual(reported, []);
  });

  it("defers only sidebar layout keys with a pending write", () => {
    const qc = new QueryClient();
    assert.equal(sidebarLayoutRefetchDeferred(qc, key), false);
    assert.equal(sidebarLayoutRefetchDeferred(qc, ["agents", WS]), false);
  });
});
