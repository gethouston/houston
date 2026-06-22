import { test, expect } from "bun:test";
import { PgWorkspaceStore } from "./pg";
import type { WorkspaceStore } from "../ports";

/**
 * Static shape / SQL-text test. No live Postgres: a fake Pool records every
 * (text, params) pair so we can assert queries are parameterized and that the
 * class satisfies the full WorkspaceStore surface. We never assert on returned
 * domain data here beyond what a fake row round-trips — that is integration
 * territory.
 */

interface Call {
  text: string;
  params: unknown[];
}

interface FakeResult {
  rows?: unknown[];
  rowCount?: number;
}

/**
 * `resultFor(text)` lets a test stub what a given query returns (rows for a
 * SELECT/RETURNING, rowCount for a DELETE). Default: empty rows, rowCount 1
 * (a write affected its row), so mutating methods don't spuriously throw.
 */
function fakePool(resultFor: (text: string) => FakeResult = () => ({})) {
  const calls: Call[] = [];
  const pool = {
    query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      const r = resultFor(text);
      return Promise.resolve({ rows: r.rows ?? [], rowCount: r.rowCount ?? 1 });
    },
  };
  return { pool: pool as never, calls };
}

/** Every literal that callers control. None may appear inline in any SQL text. */
const SENSITIVE = [
  "Robert'); DROP TABLE workspaces;--",
  "u-123",
  "ws-456",
  "a-789",
  "Mallory",
];

test("PgWorkspaceStore implements every WorkspaceStore method", () => {
  const { pool } = fakePool();
  const store: WorkspaceStore = new PgWorkspaceStore(pool);
  const methods: (keyof WorkspaceStore)[] = [
    "getOrCreatePersonalWorkspace",
    "getWorkspace",
    "getAgent",
    "listAgents",
    "listWorkspaces",
    "listAllAgents",
    "createAgent",
    "renameAgent",
    "deleteAgent",
    "setWorkspaceRuntime",
  ];
  for (const m of methods) {
    expect(typeof store[m]).toBe("function");
  }
});

test("every method issues only parameterized queries (no input interpolation)", async () => {
  // The INSERT ... RETURNING / UPDATE ... RETURNING paths need a row back so the
  // mutating methods complete; the round-tripped values are irrelevant here.
  const { pool, calls } = fakePool((text) => {
    if (/RETURNING/i.test(text)) {
      return text.includes("workspaces")
        ? {
            rows: [
              {
                id: "ws-x",
                owner_user_id: "u-123",
                kind: "personal",
                runtime: "gke",
                name: "Personal",
                slug: "u-123",
                created_at: "1",
              },
            ],
          }
        : {
            rows: [
              {
                id: "a-789",
                workspace_id: "ws-456",
                name: "Mallory",
                created_at: "1",
              },
            ],
          };
    }
    return { rows: [] };
  });
  const store = new PgWorkspaceStore(pool);

  await store.getOrCreatePersonalWorkspace("u-123");
  await store.getWorkspace("ws-456");
  await store.getAgent("a-789");
  await store.listAgents("ws-456");
  await store.listWorkspaces();
  await store.listAllAgents();
  await store.createAgent({
    workspaceId: "ws-456",
    name: "Robert'); DROP TABLE workspaces;--",
  });
  await store.renameAgent("a-789", "Mallory");
  await store.setWorkspaceRuntime("ws-x", "cloudrun");
  await store.deleteAgent("a-789");

  for (const { text, params } of calls) {
    // No sensitive caller value is ever spliced into the SQL string.
    for (const s of SENSITIVE) {
      expect(text.includes(s)).toBe(false);
    }
    // Any query that takes input must use $-placeholders and pass params.
    if (params.length > 0) {
      expect(text).toMatch(/\$\d/);
      // Placeholder count matches the highest $n referenced.
      const refs = [...text.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
      const maxRef = Math.max(...refs);
      expect(maxRef).toBe(params.length);
    }
  }
});

test("getOrCreatePersonalWorkspace returns the existing personal workspace without inserting", async () => {
  const existingRow = {
    id: "ws-existing",
    owner_user_id: "u-1",
    kind: "personal",
    runtime: "gke",
    name: "Personal",
    slug: "u-1",
    created_at: "1717000000000",
  };
  const { pool, calls } = fakePool((text) =>
    text.startsWith("SELECT") ? { rows: [existingRow] } : {},
  );
  const store = new PgWorkspaceStore(pool);

  const ws = await store.getOrCreatePersonalWorkspace("u-1");

  // The first query is a parameterized SELECT scoped to the user + personal kind.
  const first = calls[0];
  if (!first) throw new Error("Expected at least one query call");
  expect(first.text).toMatch(/SELECT/i);
  expect(first.text).toMatch(/FROM workspaces/i);
  expect(first.text).toMatch(/owner_user_id = \$1/i);
  expect(first.text).toMatch(/kind = 'personal'/i);
  expect(first.params).toEqual(["u-1"]);

  // It short-circuits: no INSERT issued, and the row maps to the domain shape.
  expect(calls.some((c) => /INSERT INTO workspaces/i.test(c.text))).toBe(false);
  expect(ws).toEqual({
    id: "ws-existing",
    ownerUserId: "u-1",
    kind: "personal",
    runtime: "gke",
    name: "Personal",
    slug: "u-1",
    createdAt: 1717000000000,
  });
});

test("getOrCreatePersonalWorkspace inserts a personal workspace upsert when none exists", async () => {
  // SELECT returns nothing; the INSERT ... RETURNING gives us the new row back.
  const { pool, calls } = fakePool((text) => {
    if (text.includes("INSERT INTO workspaces")) {
      return {
        rows: [
          {
            id: "ws-new",
            owner_user_id: "u-2",
            kind: "personal",
            runtime: "gke",
            name: "Personal",
            slug: "u-2",
            created_at: "1717000000001",
          },
        ],
      };
    }
    return { rows: [] }; // the initial SELECT finds nothing
  });
  const store = new PgWorkspaceStore(pool);

  const ws = await store.getOrCreatePersonalWorkspace("u-2");

  const insert = calls.find((c) => /INSERT INTO workspaces/i.test(c.text));
  expect(insert).toBeDefined();
  if (!insert) throw new Error("Expected an INSERT INTO workspaces call");
  // Upsert guard: the partial unique index on the personal workspace.
  expect(insert.text).toMatch(
    /ON CONFLICT \(owner_user_id\) WHERE kind = 'personal'/i,
  );
  expect(insert.text).toMatch(/DO NOTHING/i);
  expect(insert.text).toMatch(/RETURNING/i);
  // kind is a literal in SQL, name/slug come from params; never the userId raw in text.
  expect(insert.params[1]).toBe("u-2");
  expect(insert.params[2]).toBe("Personal");
  expect(insert.params[3]).toBe("u-2"); // slug = slugify(userId)
  expect(ws.id).toBe("ws-new");
  expect(ws.ownerUserId).toBe("u-2");
  expect(ws.createdAt).toBe(1717000000001);
});

test("getOrCreatePersonalWorkspace re-reads the winner when the upsert is a no-op (race)", async () => {
  // SELECT #1 empty → INSERT DO NOTHING returns no row → SELECT #2 finds the
  // concurrent winner's row.
  let selects = 0;
  const winnerRow = {
    id: "ws-winner",
    owner_user_id: "u-3",
    kind: "personal",
    runtime: "gke",
    name: "Personal",
    slug: "u-3",
    created_at: "1717000000002",
  };
  const { pool, calls } = fakePool((text) => {
    if (text.includes("INSERT INTO workspaces")) return { rows: [] }; // conflict → DO NOTHING
    if (text.startsWith("SELECT")) {
      selects += 1;
      return selects === 1 ? { rows: [] } : { rows: [winnerRow] };
    }
    return {};
  });
  const store = new PgWorkspaceStore(pool);

  const ws = await store.getOrCreatePersonalWorkspace("u-3");

  const selectCalls = calls.filter((c) => c.text.startsWith("SELECT"));
  expect(selectCalls.length).toBe(2); // re-read after the no-op insert
  expect(ws.id).toBe("ws-winner");
});

test("getWorkspace / getAgent return null when the row is absent", async () => {
  const { pool } = fakePool(() => ({ rows: [] }));
  const store = new PgWorkspaceStore(pool);
  expect(await store.getWorkspace("ws-missing")).toBeNull();
  expect(await store.getAgent("a-missing")).toBeNull();
});

test("getWorkspace binds the id and maps snake_case → domain", async () => {
  const { pool, calls } = fakePool((text) =>
    text.includes("FROM workspaces")
      ? {
          rows: [
            {
              id: "ws-1",
              owner_user_id: "u-1",
              kind: "org",
              runtime: "gke",
              name: "Acme",
              slug: "acme",
              created_at: "42",
            },
          ],
        }
      : {},
  );
  const store = new PgWorkspaceStore(pool);
  const ws = await store.getWorkspace("ws-1");
  expect(calls[0]?.params).toEqual(["ws-1"]);
  expect(ws).toEqual({
    id: "ws-1",
    ownerUserId: "u-1",
    kind: "org",
    runtime: "gke",
    name: "Acme",
    slug: "acme",
    createdAt: 42,
  });
});

test("listAgents filters by workspace_id and binds it", async () => {
  const { pool, calls } = fakePool(() => ({ rows: [] }));
  const store = new PgWorkspaceStore(pool);
  await store.listAgents("ws-456");
  const q = calls[0];
  if (!q) throw new Error("Expected at least one query call");
  expect(q.text).toMatch(/SELECT/i);
  expect(q.text).toMatch(/FROM agents/i);
  expect(q.text).toMatch(/WHERE workspace_id = \$1/i);
  expect(q.params).toEqual(["ws-456"]);
});

test("listWorkspaces selects every workspace with no caller input", async () => {
  const { pool, calls } = fakePool(() => ({ rows: [] }));
  const store = new PgWorkspaceStore(pool);
  await store.listWorkspaces();
  const q = calls[0];
  if (!q) throw new Error("Expected at least one query call");
  expect(q.text).toMatch(/SELECT/i);
  expect(q.text).toMatch(/FROM workspaces/i);
  expect(q.text).not.toMatch(/WHERE/i);
  expect(q.params).toEqual([]);
});

test("listAllAgents selects every agent with no caller input", async () => {
  const { pool, calls } = fakePool(() => ({ rows: [] }));
  const store = new PgWorkspaceStore(pool);
  await store.listAllAgents();
  const q = calls[0];
  if (!q) throw new Error("Expected at least one query call");
  expect(q.text).toMatch(/SELECT/i);
  expect(q.text).toMatch(/FROM agents/i);
  expect(q.text).not.toMatch(/WHERE/i);
  expect(q.params).toEqual([]);
});

test("createAgent inserts id/workspace_id/name/created_at as bound params", async () => {
  const { pool, calls } = fakePool();
  const store = new PgWorkspaceStore(pool);
  const agent = await store.createAgent({
    workspaceId: "ws-456",
    name: "Scout",
  });
  const insert = calls[0];
  if (!insert) throw new Error("Expected at least one query call");
  expect(insert.text).toMatch(/INSERT INTO agents/i);
  expect(insert.params).toEqual([agent.id, "ws-456", "Scout", agent.createdAt]);
  expect(agent.workspaceId).toBe("ws-456");
  expect(agent.name).toBe("Scout");
});

test("renameAgent updates by id and returns the updated row", async () => {
  const { pool, calls } = fakePool((text) =>
    text.includes("UPDATE agents")
      ? {
          rows: [
            {
              id: "a-1",
              workspace_id: "ws-1",
              name: "Renamed",
              created_at: "7",
            },
          ],
        }
      : {},
  );
  const store = new PgWorkspaceStore(pool);
  const agent = await store.renameAgent("a-1", "Renamed");
  const update = calls[0];
  if (!update) throw new Error("Expected at least one query call");
  expect(update.text).toMatch(/UPDATE agents SET name = \$2 WHERE id = \$1/i);
  expect(update.text).toMatch(/RETURNING/i);
  expect(update.params).toEqual(["a-1", "Renamed"]);
  expect(agent).toEqual({
    id: "a-1",
    workspaceId: "ws-1",
    name: "Renamed",
    createdAt: 7,
  });
});

test("renameAgent surfaces an error when the agent does not exist (no silent default)", async () => {
  const { pool } = fakePool(() => ({ rows: [] })); // UPDATE ... RETURNING matched nothing
  const store = new PgWorkspaceStore(pool);
  await expect(store.renameAgent("a-missing", "X")).rejects.toThrow(
    /unknown agent/,
  );
});

test("deleteAgent deletes by bound id", async () => {
  const { pool, calls } = fakePool(() => ({ rowCount: 1 }));
  const store = new PgWorkspaceStore(pool);
  await store.deleteAgent("a-789");
  const del = calls[0];
  if (!del) throw new Error("Expected at least one query call");
  expect(del.text).toMatch(/DELETE FROM agents WHERE id = \$1/i);
  expect(del.params).toEqual(["a-789"]);
});

test("deleteAgent surfaces an error when nothing was deleted (no silent success)", async () => {
  const { pool } = fakePool(() => ({ rowCount: 0 }));
  const store = new PgWorkspaceStore(pool);
  await expect(store.deleteAgent("a-missing")).rejects.toThrow(/unknown agent/);
});

test("a corrupted workspace kind surfaces as an error, never a silent default", async () => {
  const { pool } = fakePool((text) =>
    text.includes("FROM workspaces")
      ? {
          rows: [
            {
              id: "ws-x",
              owner_user_id: "u-1",
              kind: "enterprise",
              name: "X",
              slug: "x",
              created_at: "1",
            },
          ],
        }
      : {},
  );
  const store = new PgWorkspaceStore(pool);
  await expect(store.getWorkspace("ws-x")).rejects.toThrow(
    /invalid workspace kind/,
  );
});
