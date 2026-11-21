import { mergeRoutineRunArrays } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import {
  DOC_MERGE_ROUNDS,
  publishDerived,
  publishMerged,
} from "./turn-doc-merge-publish";
import { docStore, type Row, row } from "./turn-doc-store.test-support";

const options = (fetchImpl: typeof fetch) => ({
  family: "routine_runs",
  baseUrl: "https://store.example",
  org: "acme",
  agent: "helper",
  conversationId: "routine-r1",
  hostToken: "host-token",
  claim: { token: "t", bootId: "b" },
  fetchImpl,
  retryDelaysMs: [],
});

const mergeInto = (rows: Row[]) => (current: unknown) =>
  mergeRoutineRunArrays(Array.isArray(current) ? current : [], rows);

test("eight runs publishing at once all land their row", async () => {
  const store = docStore([row("run-0", 0)]);
  const runs = Array.from({ length: 8 }, (_, i) => row(`run-${i + 1}`, i + 1));

  const results = await Promise.all(
    runs.map((mine) =>
      publishMerged(options(store.fetchImpl), mergeInto([mine]), () => 0),
    ),
  );

  expect(results).toEqual(runs.map(() => ({ ok: true })));
  expect(store.doc().map((r) => r.id)).toEqual([
    ...runs.map((r) => r.id).reverse(),
    "run-0",
  ]);
});

test("a doc still contended after every round is reported, not claimed", async () => {
  const store = docStore([row("run-0", 0)]);
  let rounds = 0;
  const contended = (async (url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT") {
      rounds += 1;
      store.raceNextPut([row(`other-${rounds}`, rounds), row("run-0", 0)]);
    }
    return store.fetchImpl(String(url), init);
  }) as typeof fetch;

  const result = await publishMerged(
    options(contended),
    mergeInto([row("mine", 9)]),
    () => 0,
  );

  expect(result).toEqual({ error: "PUT rejected (409)" });
  expect(rounds).toBe(DOC_MERGE_ROUNDS);
});

test("a derived doc reads the object only after the revision it lands at", async () => {
  const store = docStore([row("run-0", 0)]);
  const steps: string[] = [];
  const traced = (async (url: unknown, init?: RequestInit) => {
    steps.push(init?.method ?? "GET");
    return store.fetchImpl(String(url), init);
  }) as typeof fetch;

  const result = await publishDerived(options(traced), async () => {
    steps.push("derive");
    return [row("run-0", 0), row("mine", 1)];
  });

  expect(result).toEqual({ ok: true });
  expect(steps).toEqual(["GET", "derive", "PUT"]);
});

test("a derived doc that lost the race re-reads the object, never re-sends its copy", async () => {
  const store = docStore([row("run-0", 0)]);
  let object = [row("run-0", 0), row("mine", 1)];
  store.raceNextPut([row("run-0", 0), row("other", 2)]);
  const raced = (async (url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT" && object.length === 2)
      object = [...object, row("other", 2)];
    return store.fetchImpl(String(url), init);
  }) as typeof fetch;
  let reads = 0;

  const result = await publishDerived(
    options(raced),
    async () => {
      reads += 1;
      return object;
    },
    () => 0,
  );

  expect(result).toEqual({ ok: true });
  expect(reads).toBe(2);
  expect(store.doc().map((r) => r.id)).toEqual(["run-0", "mine", "other"]);
});
