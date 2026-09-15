import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";
import {
  type Call,
  createWireCapture,
  json,
  ORG,
} from "./support/wire-capture";

/**
 * The agent-data migration pair rides `sdk.migration`. What this file pins is
 * the WIRE: the two per-agent routes, their methods, the import's zip content
 * type and its conditional query, the export's body bytes, and the headers that
 * carry auth and the active space — the whole recorded request, because
 * `migration/export` and `migration/import` differ by one segment and a
 * substring match would let one stand in for the other.
 *
 * Each case drives the composed `HoustonClient` (what the app holds), not the
 * SDK. Neither call degrades: a copy that quietly wrote nothing would read to
 * the user as a copy that worked, so every status reaches the caller as a
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

describe("what neither half softens", () => {
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
});
