import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The agent-data migration family rides `sdk.migration`. What this file pins is
 * the WIRE: the four per-agent routes, their methods, the import's zip content
 * type and its conditional query, the export's and the complete's body bytes,
 * and the headers that carry auth and the active space — the whole recorded
 * request, because the four spellings differ by one segment and a substring
 * match would let one stand in for another.
 *
 * Each case drives the composed `HoustonClient` (what the app holds), not the
 * SDK. No call degrades: a copy that quietly wrote nothing would read to the
 * user as a copy that worked, so every status reaches the caller as a
 * `HoustonEngineError` with the host's parsed body.
 */

const BASE = "https://gw.example";

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  reset();
});

afterEach(() => {
  restore();
  vi.clearAllMocks();
});

const RESULT = {
  written: 3,
  skipped: 1,
  rejected: [{ path: "secrets.env", reason: "out of scope" }],
  sessionsRebuilt: true,
};

/** A cloud client with a team space active, so `x-houston-org` is live. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG);
  return c;
}

/** The single request the call made, with the two auth headers checked. */
function soleCall(): Call {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG);
  return call;
}

/** A marker as the target's status route hands it back. */
const MARKER = {
  completedAt: "2026-09-15T10:00:00.000Z",
  source: { workspace: "Personal", agent: "Assistant" },
  counts: { written: 9, skipped: 2, rejected: 0, sessionsRebuilt: true },
};

/** The archive bytes a stubbed export answers with. */
const zip = () => new Response(new Uint8Array([80, 75, 3, 4]), { status: 200 });

describe("the delegated migration requests", () => {
  test("migrationExport POSTs the paths and answers the archive", async () => {
    stubFetch(zip);
    const archive = await client().migrationExport("a1", [
      "CLAUDE.md",
      ".houston/chat/1.json",
    ]);
    expect(new Uint8Array(archive)).toEqual(new Uint8Array([80, 75, 3, 4]));
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/agents/a1/migration/export`);
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(call.body).toBe(
      JSON.stringify({ paths: ["CLAUDE.md", ".houston/chat/1.json"] }),
    );
  });

  test("migrationImport POSTs the zip content type and answers the result", async () => {
    stubFetch(() => json(200, RESULT));
    const result = await client().migrationImport(
      "a1",
      new Uint8Array([1, 2, 3]).buffer,
    );
    expect(result).toEqual(RESULT);
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/agents/a1/migration/import`);
    expect(call.headers.get("Content-Type")).toBe("application/zip");
  });

  test("only the import options the caller set reach the query", async () => {
    stubFetch(() => json(200, RESULT));
    const c = client();
    const bytes = new ArrayBuffer(0);
    await c.migrationImport("a1", bytes, { sessions: false });
    await c.migrationImport("a1", bytes, { overwrite: true, sessions: false });
    await c.migrationImport("a1", bytes, { sessions: true });
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/agents/a1/migration/import?sessions=0`,
      `${BASE}/agents/a1/migration/import?overwrite=1&sessions=0`,
      `${BASE}/agents/a1/migration/import`,
    ]);
  });

  test("an agent id reaches the path escaped per segment", async () => {
    stubFetch(zip);
    await client().migrationExport("Team A/Agent", []);
    expect(soleCall().url).toBe(
      `${BASE}/agents/Team%20A%2FAgent/migration/export`,
    );
  });
});

describe("the delegated marker requests", () => {
  test("migrationComplete POSTs the source and counts as ONE request", async () => {
    stubFetch(() => json(200, { ok: true }));
    await client().migrationComplete(
      "a1",
      { workspace: "Personal", agent: "Assistant" },
      { written: 9, skipped: 2, rejected: 0, sessionsRebuilt: true },
    );
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${BASE}/agents/a1/migration/complete`);
    expect(call.headers.get("Content-Type")).toBe("application/json");
    expect(call.body).toBe(
      JSON.stringify({
        source: { workspace: "Personal", agent: "Assistant" },
        counts: { written: 9, skipped: 2, rejected: 0, sessionsRebuilt: true },
      }),
    );
  });

  test("migrationStatus GETs the route and unwraps the marker", async () => {
    stubFetch(() => json(200, { imported: MARKER }));
    expect(await client().migrationStatus("a1")).toEqual(MARKER);
    const call = soleCall();
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${BASE}/agents/a1/migration/status`);
  });

  test("a server holding no marker answers null, not an error", async () => {
    stubFetch(() => json(200, { imported: null }));
    expect(await client().migrationStatus("a1")).toBeNull();
  });
});

describe("what no half softens", () => {
  test("an export failure keeps the host's parsed body and status", async () => {
    stubFetch(() => json(503, { error: "agent data not configured" }));
    const err = await client()
      .migrationExport("a1", [])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(503);
    expect((err as HoustonEngineError).body).toMatchObject({
      error: "agent data not configured",
    });
  });

  test("an oversized import throws rather than reporting a partial write", async () => {
    stubFetch(() => json(413, { error: "import body too large" }));
    const err = await client()
      .migrationImport("a1", new ArrayBuffer(0))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(413);
    expect((err as HoustonEngineError).agentId).toBe("a1");
  });

  // A pod that cannot answer the probe must not read as "this agent was never
  // imported": the resume decision belongs to the wizard, which sees the 404.
  test("a missing status route reaches the caller as a 404, not as null", async () => {
    stubFetch(() => json(404, { error: "not found" }));
    const err = await client()
      .migrationStatus("a1")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(404);
  });

  test("a failed complete keeps the host's status rather than reporting a stamp", async () => {
    stubFetch(() => json(503, { error: "agent data not configured" }));
    const err = await client()
      .migrationComplete(
        "a1",
        { workspace: "Personal", agent: "Assistant" },
        { written: 0, skipped: 0, rejected: 0, sessionsRebuilt: false },
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HoustonEngineError);
    expect((err as HoustonEngineError).status).toBe(503);
    expect((err as HoustonEngineError).body).toMatchObject({
      error: "agent data not configured",
    });
  });
});
