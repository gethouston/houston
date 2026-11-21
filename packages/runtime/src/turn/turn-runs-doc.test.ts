import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { TurnServerDeps } from "./server-types";
import { docStore, type Row, row } from "./turn-doc-store.test-support";
import type { TurnFilesystem } from "./turn-filesystem";
import { publishTurnRunsDoc } from "./turn-runs-doc";
import type { TurnRequest } from "./types";

async function publishRows(rows: Row[], fetchImpl: typeof fetch) {
  const workspaceDir = await mkdtemp(join(tmpdir(), "turn-runs-doc-"));
  const runsDir = join(workspaceDir, ".houston", "routine_runs");
  await mkdir(runsDir, { recursive: true });
  await writeFile(join(runsDir, "routine_runs.json"), JSON.stringify(rows));
  return publishTurnRunsDoc(
    {
      poolStoreUrl: "https://store.example",
      fetchImpl,
    } as unknown as TurnServerDeps,
    {
      shadow: false,
      claim: { token: "t", bootId: "b" },
      hostToken: "host-token",
      gcsPrefix: "ws/acme/helper",
      conversationId: "routine-r1",
      turnId: "run-2",
    } as unknown as TurnRequest & { turnId: string },
    { workspaceDir, workspaceRel: "acme/helper" } as unknown as TurnFilesystem,
  );
}

const ids = (rows: Row[]) => rows.map((r) => r.id);

test("a slower run keeps the rows a newer doc already holds", async () => {
  const store = docStore([row("run-3", 3), row("run-1", 1)]);
  const result = await publishRows(
    [row("run-2", 2), row("run-1", 1)],
    store.fetchImpl,
  );
  expect(result).toEqual({ ok: true });
  expect(ids(store.doc())).toEqual(["run-3", "run-2", "run-1"]);
});

test("the doc's settled copy beats this run's stale running copy", async () => {
  const store = docStore([row("run-1", 1)]);
  await publishRows(
    [row("run-2", 2), row("run-1", 1, "running")],
    store.fetchImpl,
  );
  expect(store.doc().find((r) => r.id === "run-1")?.status).toBe("surfaced");
});

test("a lost revision race merges into the doc the 409 names", async () => {
  const store = docStore([row("run-1", 1)]);
  store.raceNextPut([row("run-3", 3), row("run-1", 1)]);
  const result = await publishRows(
    [row("run-2", 2), row("run-1", 1)],
    store.fetchImpl,
  );
  expect(result).toEqual({ ok: true });
  expect(store.puts).toEqual([1, 2]);
  expect(ids(store.doc())).toEqual(["run-3", "run-2", "run-1"]);
});

test("a 409 without the doc re-reads it before merging", async () => {
  const store = docStore([row("run-1", 1)], { bareConflict: true });
  store.raceNextPut([row("run-3", 3), row("run-1", 1)]);
  const result = await publishRows([row("run-2", 2)], store.fetchImpl);
  expect(result).toEqual({ ok: true });
  expect(ids(store.doc())).toEqual(["run-3", "run-2", "run-1"]);
});

test("the first publisher creates the doc from its own rows", async () => {
  const store = docStore(undefined);
  const result = await publishRows([row("run-2", 2)], store.fetchImpl);
  expect(result).toEqual({ ok: true });
  expect(store.puts).toEqual([0]);
  expect(ids(store.doc())).toEqual(["run-2"]);
});

test("a doc answer that names no doc is refused, never replaced by this run's rows", async () => {
  const puts: string[] = [];
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    if (init?.method === "PUT") {
      puts.push(String(init.body));
      return Response.json({ revision: 2 });
    }
    return Response.json({ revision: 1 });
  }) as typeof fetch;
  const result = await publishRows([row("run-2", 2)], fetchImpl);
  expect(result).toEqual({ error: "GET answered without a doc" });
  expect(puts).toEqual([]);
});
