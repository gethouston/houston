import { deepStrictEqual, strictEqual } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  type OptimisticWrite,
  runOptimisticWrite,
} from "../src/lib/optimistic-core.ts";
import { revertRows } from "../src/lib/row-revert.ts";

type Row = { id: string };
const KEY = ["activity", "/agents/a"] as const;
const dropM1 = {
  queryKey: KEY,
  apply: (rows: Row[] | undefined) => rows?.filter((r) => r.id !== "m1"),
};
const failure = { title: "Couldn't delete", description: "It's back." };

function deferred() {
  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function seeded(): QueryClient {
  const qc = new QueryClient();
  qc.setQueryData<Row[]>(KEY, [{ id: "m1" }, { id: "m2" }]);
  return qc;
}

let refusals: Array<{ command: string; title: string }> = [];
afterEach(() => {
  refusals = [];
});
const optimisticWrite = <T>(opts: OptimisticWrite<T>) =>
  runOptimisticWrite(opts, (command, _err, copy) => {
    refusals.push({ command, title: copy.title });
  });

describe("optimisticWrite", () => {
  it("paints the patch before the write settles", async () => {
    const qc = seeded();
    const host = deferred();
    const done = optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM1],
      write: () => host.promise,
      failure,
    });
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m2" }]);
    host.resolve();
    await done;
    strictEqual(refusals.length, 0);
  });

  it("rolls back and shows the authored copy when the host refuses", async () => {
    const qc = seeded();
    let rolledBack = false;
    await optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM1],
      write: () => Promise.reject(new Error("boom")),
      failure,
      onError: () => {
        rolledBack = true;
      },
    });
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m1" }, { id: "m2" }]);
    strictEqual(rolledBack, true);
    deepStrictEqual(refusals, [
      { command: "delete_mission", title: failure.title },
    ]);
  });

  it("holds the patch over a refetch that lands mid-write", async () => {
    const qc = seeded();
    const host = deferred();
    const done = optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM1],
      write: () => host.promise,
      failure,
    });
    await qc.fetchQuery({
      queryKey: KEY,
      queryFn: () => [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
      staleTime: 0,
    });
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m2" }, { id: "m3" }]);
    host.resolve();
    await done;
    await qc.fetchQuery({
      queryKey: KEY,
      queryFn: () => [{ id: "m1" }],
      staleTime: 0,
    });
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m1" }]);
  });

  it("holds the patch over a direct slice write that lands mid-write", async () => {
    const qc = seeded();
    const host = deferred();
    const done = optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM1],
      write: () => host.promise,
      failure,
    });
    qc.setQueryData<Row[]>(KEY, [{ id: "m1" }, { id: "m2" }, { id: "m3" }]);
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m2" }, { id: "m3" }]);
    host.resolve();
    await done;
    qc.setQueryData<Row[]>(KEY, [{ id: "m1" }]);
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m1" }]);
  });

  it("keeps a write still in flight painted when a neighbour rolls back", async () => {
    const qc = seeded();
    const first = deferred();
    const second = deferred();
    const dropM2 = {
      queryKey: KEY,
      apply: (rows: Row[] | undefined) => rows?.filter((r) => r.id !== "m2"),
    };
    const a = optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM1],
      write: () => first.promise,
      failure,
    });
    const b = optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM2],
      write: () => second.promise,
      failure,
    });
    deepStrictEqual(qc.getQueryData(KEY), []);
    first.reject(new Error("boom"));
    await a;
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m1" }]);
    second.resolve();
    await b;
    strictEqual(refusals.length, 1);
  });

  it("rolls back a write that throws before it returns a promise", async () => {
    const qc = seeded();
    await optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM1],
      write: () => {
        throw new Error("warming");
      },
      failure,
    });
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m1" }, { id: "m2" }]);
    deepStrictEqual(refusals, [
      { command: "delete_mission", title: failure.title },
    ]);
  });

  it("a row-level revert keeps rows that landed mid-write", async () => {
    const qc = seeded();
    const host = deferred();
    const done = optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [
        {
          ...dropM1,
          revert: (rows: Row[] | undefined, before: Row[] | undefined) =>
            revertRows(rows, before, {
              keyOf: (r) => r.id,
              touched: (r) => r.id === "m1",
            }),
        },
      ],
      write: () => host.promise,
      failure,
    });
    qc.setQueryData<Row[]>(KEY, [{ id: "m2" }, { id: "m3" }]);
    host.reject(new Error("boom"));
    await done;
    deepStrictEqual(qc.getQueryData(KEY), [
      { id: "m1" },
      { id: "m2" },
      { id: "m3" },
    ]);
  });

  it("leaves a roster variant's first load running", async () => {
    const qc = seeded();
    const VARIANT = ["activity", "/agents/a", "first"] as const;
    let land!: (rows: Row[]) => void;
    const loading = qc.fetchQuery({
      queryKey: VARIANT,
      queryFn: () =>
        new Promise<Row[]>((resolve) => {
          land = resolve;
        }),
    });
    const host = deferred();
    const done = optimisticWrite({
      qc,
      command: "delete_mission",
      patches: [dropM1],
      write: () => host.promise,
      failure,
    });
    land([{ id: "m1" }, { id: "m4" }]);
    deepStrictEqual(await loading, [{ id: "m1" }, { id: "m4" }]);
    deepStrictEqual(qc.getQueryData(VARIANT), [{ id: "m4" }]);
    host.resolve();
    await done;
  });

  it("never rejects when a callback throws, and reports it", async () => {
    const qc = seeded();
    const bugs: string[] = [];
    const run = (fail: boolean) =>
      runOptimisticWrite(
        {
          qc,
          command: "delete_mission",
          patches: [dropM1],
          write: () =>
            fail ? Promise.reject(new Error("boom")) : Promise.resolve(),
          failure,
          onSuccess: () => {
            throw new Error("success hook");
          },
          onError: () => {
            throw new Error("error hook");
          },
        },
        () => {
          throw new Error("refusal surface");
        },
        (command, err) => bugs.push(`${command}:${(err as Error).message}`),
      );
    await run(false);
    await run(true);
    deepStrictEqual(bugs, [
      "delete_mission:success hook",
      "delete_mission:refusal surface",
      "delete_mission:error hook",
    ]);
    deepStrictEqual(qc.getQueryData(KEY), [{ id: "m2" }]);
  });
});
