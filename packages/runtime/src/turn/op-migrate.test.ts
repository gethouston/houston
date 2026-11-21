import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_STORE_MIGRATION_VERSION } from "@houston/host/src/migrate/agent-store";
import { expect, test } from "vitest";
import type { MigrateOp } from "./op-grammar-migrate";
import { executeMigrateOp } from "./op-migrate";
import {
  docRoute,
  generationStore,
  PREFIX,
  seedRequest,
} from "./op-seed.test-support";
import type { OpRequest } from "./parse-op-request";

const AGENT = "workspaces/Personal/Ledger";
const FLAT = JSON.stringify([
  { id: "r1", name: "Old", prompt: "p", schedule: "0 9 * * *" },
]);

function legacy() {
  const fake = generationStore();
  fake.put(`${AGENT}/CLAUDE.md`, "# Ledger\n");
  fake.put(`${AGENT}/.houston/routines.json`, FLAT);
  return fake;
}

async function run(
  fake: ReturnType<typeof generationStore>,
  opts: {
    fenced?: boolean;
    fetchImpl?: typeof fetch;
    docs?: ReturnType<typeof docRoute>;
    maxHydrateBytes?: number;
  } = {},
) {
  const seed = seedRequest({ name: "Ledger" });
  const request: OpRequest & { op: MigrateOp } = {
    ...seed,
    op: { kind: "migrate", version: AGENT_STORE_MIGRATION_VERSION },
  };
  const docs = opts.docs ?? docRoute();
  const reply = await executeMigrateOp({
    deps: {
      ...docs.deps,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
      ...(opts.maxHydrateBytes !== undefined
        ? { maxHydrateBytes: opts.maxHydrateBytes }
        : {}),
    },
    op: request,
    turn: { ...request, conversationId: "agent-ops" },
    store: fake.store,
    prefix: PREFIX,
    root: mkdtempSync(join(tmpdir(), "op-migrate-root-")),
    fenced: async () => opts.fenced === true,
  });
  const relayed = reply.body as { status?: number; body?: string };
  return {
    reply,
    status: relayed.status,
    answer: relayed.body
      ? (JSON.parse(relayed.body) as Record<string, unknown>)
      : {},
  };
}

test("a family file another writer lands mid-migration stays theirs, and the run is not durable", async () => {
  const fake = legacy();
  const racer = '[{"id":"r2","name":"Racer","prompt":"p"}]';
  fake.hooks.beforeUpload = (key) => {
    if (key.endsWith(".houston/routines/routines.json"))
      fake.put(`${AGENT}/.houston/routines/routines.json`, racer);
  };

  const { status, answer } = await run(fake);

  expect(status).toBe(409);
  expect(answer.code).toBe("migration_not_durable");
  expect(fake.read(`${AGENT}/.houston/routines/routines.json`)).toBe(racer);
  expect(fake.read(`${AGENT}/.houston/routines.json`)).toBe(FLAT);
});

test("two complete agent trees under one prefix are refused as layout_unexpected", async () => {
  const fake = legacy();
  fake.put("workspaces/Personal/Old/CLAUDE.md", "# Old\n");

  const { status, answer } = await run(fake);

  expect(status).toBe(500);
  expect(answer.code).toBe("layout_unexpected");
  expect(fake.uploads).toEqual([]);
});

test("files the migration reads over the hydration cap are refused before any download", async () => {
  const fake = legacy();
  fake.put(`${AGENT}/.houston/activity/activity.json`, "x".repeat(4096));

  const { status, answer } = await run(fake, { maxHydrateBytes: 1024 });

  expect(status).toBe(500);
  expect(answer.code).toBe("hydrate_over_cap");
  expect(fake.downloads).toEqual([]);
  expect(fake.uploads).toEqual([]);
});

test("a custody store that refuses the secrets keeps the plaintext and the run incomplete", async () => {
  const fake = legacy();
  fake.put("custom-integration-secrets.json", '{"ci_crm_KEY":"plain"}');
  const refusing = (async (url: unknown) =>
    String(url).includes("/custom-secrets/")
      ? new Response("down", { status: 503 })
      : Response.json(
          { error: "document not found" },
          { status: 404 },
        )) as typeof fetch;

  const { status, answer } = await run(fake, { fetchImpl: refusing });

  expect(status).toBe(200);
  expect(answer.complete).toBe(false);
  expect(await fake.keys()).toContain("custom-integration-secrets.json");
  expect(fake.deletes).toEqual([]);
});

test("a fenced claim writes nothing, custody included", async () => {
  const fake = legacy();
  fake.put("custom-integration-secrets.json", '{"ci_crm_KEY":"plain"}');
  const custody: string[] = [];
  const recording = (async (url: unknown, init?: RequestInit) => {
    if (String(url).includes("/custom-secrets/"))
      custody.push(init?.method ?? "GET");
    return Response.json({ error: "not found" }, { status: 404 });
  }) as typeof fetch;

  const { reply } = await run(fake, { fenced: true, fetchImpl: recording });

  expect(reply).toEqual({ status: 409, body: { error: "claim_fenced" } });
  expect(fake.uploads).toEqual([]);
  expect(custody).toEqual([]);
});

test("a removal marker never lands before the removal it records", async () => {
  const fake = legacy();
  fake.put(`${AGENT}/GROUP.md`, "Team context\n");
  fake.hooks.beforeUpload = (key) => {
    if (key.endsWith(".houston/routines/routines.json"))
      fake.put(`${AGENT}/.houston/routines/routines.json`, "[]");
  };

  const first = await run(fake);

  expect(first.answer.code).toBe("migration_not_durable");
  expect(fake.read(`${AGENT}/GROUP.md`)).toBe("Team context\n");
  expect(await fake.keys()).not.toContain(
    "workspaces/ws/Personal/preferences.json",
  );
});

test("projections that keep failing leave the version unconfirmed", async () => {
  const fake = legacy();

  const { status, answer } = await run(fake, { docs: docRoute(503) });

  expect(status).toBe(200);
  expect(answer.complete).toBe(false);
  expect((answer.docsLagging as string[]).length).toBeGreaterThan(0);
});

test("a family file no salvage can read is never projected over its doc", async () => {
  const fake = legacy();
  fake.put(`${AGENT}/.houston/activity/activity.json`, "{not json at all");
  const docs = docRoute(200, ["activity"]);

  const { answer } = await run(fake, { docs });

  expect(docs.puts.map((p) => p.family)).not.toContain("activity");
  expect(answer.complete).toBe(true);
});

test("a family file with trailing junk projects what the pod's read salvages", async () => {
  const fake = legacy();
  fake.put(
    `${AGENT}/.houston/activity/activity.json`,
    '[{"id":"a1","title":"T","status":"done"}]\n}',
  );
  const docs = docRoute();

  await run(fake, { docs });

  expect(docs.puts.find((p) => p.family === "activity")?.doc).toEqual([
    expect.objectContaining({ id: "a1" }),
  ]);
});

function scriptedDocs(
  beforePut?: (
    family: string,
    state: Map<string, { doc: unknown; revision: number }>,
  ) => Response | undefined,
) {
  const state = new Map<string, { doc: unknown; revision: number }>();
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    const family = String(url).split("/").pop() ?? "";
    if (!init?.method || init.method === "GET") {
      const current = state.get(family);
      return current
        ? Response.json(current, { headers: { ETag: `"${current.revision}"` } })
        : Response.json({ error: "document not found" }, { status: 404 });
    }
    const scripted = beforePut?.(family, state);
    if (scripted) return scripted;
    const revision = state.get(family)?.revision ?? 0;
    if (Number(new Headers(init.headers).get("If-Match")) !== revision)
      return Response.json({ revision }, { status: 409 });
    const { doc } = JSON.parse(String(init.body)) as { doc: unknown };
    state.set(family, { doc, revision: revision + 1 });
    return Response.json({ revision: revision + 1 });
  }) as typeof fetch;
  return {
    state,
    docs: {
      puts: [],
      deps: {
        poolStoreUrl: "https://store.example",
        fetchImpl,
        activityDocRetryDelaysMs: [],
      },
    } as unknown as ReturnType<typeof docRoute>,
  };
}

test("a projection that loses its revision race checks the doc again", async () => {
  const fake = legacy();
  fake.put(
    `${AGENT}/.houston/activity/activity.json`,
    '[{"id":"new","title":"New","status":"done"}]',
  );
  let raced = false;
  const { state, docs } = scriptedDocs((family, docState) => {
    if (family !== "activity" || raced) return undefined;
    raced = true;
    docState.set("activity", {
      doc: [{ id: "old", title: "Old", status: "done" }],
      revision: 1,
    });
    return Response.json({ revision: 1 }, { status: 409 });
  });

  const { answer } = await run(fake, { docs });

  expect(state.get("activity")?.doc).toEqual([
    expect.objectContaining({ id: "new" }),
  ]);
  expect(answer.complete).toBe(true);
});

test("a doc route that refuses a family leaves the projection unconfirmed", async () => {
  const fake = legacy();
  const { docs } = scriptedDocs(() => new Response("", { status: 403 }));

  const { answer } = await run(fake, { docs });

  expect(answer.complete).toBe(false);
});

function custodyRoute(create: () => Response, confirm?: string) {
  const calls: string[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    if (!String(url).includes("/custom-secrets/"))
      return Response.json({ error: "document not found" }, { status: 404 });
    const method = init?.method ?? "GET";
    calls.push(method);
    if (method === "POST") return create();
    const value =
      calls.filter((c) => c === "GET").length > 1 ? confirm : undefined;
    return value === undefined
      ? Response.json({ error: "not found" }, { status: 404 })
      : Response.json({ value });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("a custody value that lands between the read and the create stays", async () => {
  const fake = legacy();
  fake.put("custom-integration-secrets.json", '{"ci_crm_KEY":"plain"}');
  const custody = custodyRoute(
    () => Response.json({ error: "secret exists" }, { status: 412 }),
    "rotated",
  );

  const { status, answer } = await run(fake, { fetchImpl: custody.fetchImpl });

  expect(status).toBe(200);
  expect(custody.calls).toEqual(["GET", "POST", "GET"]);
  expect(answer.secretsMoved).toBe(0);
  expect(await fake.keys()).not.toContain("custom-integration-secrets.json");
});

test("a refused create whose value no read finds yet keeps the plaintext", async () => {
  const fake = legacy();
  fake.put("custom-integration-secrets.json", '{"ci_crm_KEY":"plain"}');
  const custody = custodyRoute(() =>
    Response.json({ error: "secret exists" }, { status: 412 }),
  );

  const { status, answer } = await run(fake, { fetchImpl: custody.fetchImpl });

  expect(status).toBe(200);
  expect(answer.complete).toBe(false);
  expect(await fake.keys()).toContain("custom-integration-secrets.json");
});

test("a gateway older than the create keeps the plaintext and writes nothing", async () => {
  const fake = legacy();
  fake.put("custom-integration-secrets.json", '{"ci_crm_KEY":"plain"}');
  const custody = custodyRoute(
    () =>
      new Response("", { status: 405, headers: { Allow: "GET, PUT, DELETE" } }),
  );

  const { status, answer } = await run(fake, { fetchImpl: custody.fetchImpl });

  expect(status).toBe(200);
  expect(answer.complete).toBe(false);
  expect(custody.calls.filter((c) => c === "PUT")).toEqual([]);
  expect(await fake.keys()).toContain("custom-integration-secrets.json");
});
