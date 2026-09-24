import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { MigrationHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  contentType: string | null;
  /** The body exactly as the module handed it to `fetch` — bytes stay bytes. */
  body: unknown;
}

/**
 * A migration SDK over a mock `fetch` that records the whole wire. `reactivity`
 * is off, so every recorded call is one a migration operation made and nothing
 * else — which is what makes "exactly one request" an exact claim.
 */
function makeSdk(answer: () => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        contentType: new Headers(init?.headers).get("Content-Type"),
        body: init?.body,
      });
      return answer();
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: memoryKv(store),
    devicePreferences: memoryKv(),
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const zip = (bytes: number[]) =>
  new Response(new Uint8Array(bytes), { status: 200 });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const RESULT = {
  written: 3,
  skipped: 1,
  rejected: [{ path: "secrets.env", reason: "out of scope" }],
  sessionsRebuilt: true,
};

describe("migrationExport", () => {
  it("POSTs the requested paths and answers the archive bytes", async () => {
    const { sdk, calls } = makeSdk(() => zip([80, 75, 3, 4]));
    const archive = await sdk.migration.migrationExport("a1", [
      "CLAUDE.md",
      ".houston/chat/1.json",
    ]);
    expect(new Uint8Array(archive)).toEqual(new Uint8Array([80, 75, 3, 4]));
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/a1/migration/export`,
        contentType: "application/json",
        body: JSON.stringify({
          paths: ["CLAUDE.md", ".houston/chat/1.json"],
        }),
      },
    ]);
  });

  it("escapes the agent id per segment", async () => {
    const { sdk, calls } = makeSdk(() => zip([0]));
    await sdk.migration.migrationExport("Team A/Agent", []);
    expect(calls[0].url).toBe(
      `${BASE}/agents/Team%20A%2FAgent/migration/export`,
    );
  });

  it("throws a MigrationHttpError carrying the status", async () => {
    const { sdk } = makeSdk(() => json({ error: "no agent data" }, 503));
    const err = await sdk.migration
      .migrationExport("a1", [])
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationHttpError);
    expect((err as MigrationHttpError).status).toBe(503);
  });
});

describe("migrationImport", () => {
  it("POSTs the archive as zip bytes, unchanged", async () => {
    const { sdk, calls } = makeSdk(() => json(RESULT));
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    expect(await sdk.migration.migrationImport("a1", bytes)).toEqual(RESULT);
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/a1/migration/import`,
        contentType: "application/zip",
        body: bytes,
      },
    ]);
  });

  it("spells only the options the caller set into the query", async () => {
    const { sdk, calls } = makeSdk(() => json(RESULT));
    const bytes = new ArrayBuffer(0);
    await sdk.migration.migrationImport("a1", bytes, { sessions: false });
    await sdk.migration.migrationImport("a1", bytes, {
      overwrite: true,
      sessions: false,
    });
    await sdk.migration.migrationImport("a1", bytes, { sessions: true });
    expect(calls.map((call) => call.url)).toEqual([
      `${BASE}/agents/a1/migration/import?sessions=0`,
      `${BASE}/agents/a1/migration/import?overwrite=1&sessions=0`,
      `${BASE}/agents/a1/migration/import`,
    ]);
  });

  it("throws a MigrationHttpError rather than reporting a partial write", async () => {
    const { sdk } = makeSdk(() =>
      json({ error: "import body too large" }, 413),
    );
    const err = await sdk.migration
      .migrationImport("a1", new ArrayBuffer(0))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationHttpError);
    expect((err as MigrationHttpError).status).toBe(413);
    expect((err as MigrationHttpError).message).toContain(
      "import body too large",
    );
  });
});

const MARKER = {
  completedAt: "2026-09-15T10:00:00.000Z",
  source: { workspace: "Personal", agent: "Assistant" },
  counts: { written: 9, skipped: 2, rejected: 0, sessionsRebuilt: true },
};

describe("migrationComplete", () => {
  it("POSTs the source and counts as ONE request", async () => {
    const { sdk, calls } = makeSdk(() => json({ ok: true }));
    await sdk.migration.migrationComplete(
      "a1",
      { workspace: "Personal", agent: "Assistant" },
      { written: 9, skipped: 2, rejected: 0, sessionsRebuilt: true },
    );
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/a1/migration/complete`,
        contentType: "application/json",
        body: JSON.stringify({
          source: { workspace: "Personal", agent: "Assistant" },
          counts: {
            written: 9,
            skipped: 2,
            rejected: 0,
            sessionsRebuilt: true,
          },
        }),
      },
    ]);
  });

  it("escapes the agent id per segment", async () => {
    const { sdk, calls } = makeSdk(() => json({ ok: true }));
    await sdk.migration.migrationComplete(
      "Team A/Agent",
      { workspace: "Team A", agent: "Agent" },
      { written: 0, skipped: 0, rejected: 0, sessionsRebuilt: false },
    );
    expect(calls[0].url).toBe(
      `${BASE}/agents/Team%20A%2FAgent/migration/complete`,
    );
  });

  it("throws a MigrationHttpError carrying the status", async () => {
    const { sdk } = makeSdk(() =>
      json({ error: "agent data not configured" }, 503),
    );
    const err = await sdk.migration
      .migrationComplete(
        "a1",
        { workspace: "Personal", agent: "Assistant" },
        { written: 0, skipped: 0, rejected: 0, sessionsRebuilt: false },
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationHttpError);
    expect((err as MigrationHttpError).status).toBe(503);
  });
});

describe("migrationStatus", () => {
  it("GETs the route and unwraps the marker", async () => {
    const { sdk, calls } = makeSdk(() => json({ imported: MARKER }));
    expect(await sdk.migration.migrationStatus("a1")).toEqual(MARKER);
    expect(calls).toEqual([
      {
        method: "GET",
        url: `${BASE}/agents/a1/migration/status`,
        contentType: "application/json",
        body: undefined,
      },
    ]);
  });

  it("answers null when the server holds no marker", async () => {
    const { sdk } = makeSdk(() => json({ imported: null }));
    expect(await sdk.migration.migrationStatus("a1")).toBeNull();
  });

  // A deployment that cannot be asked is not a deployment that answered "never
  // imported": the status does NOT soften here, and the surface decides.
  it.each([
    404, 500,
  ])("throws on %i rather than reading it as absent", async (status) => {
    const { sdk } = makeSdk(() => json({ error: "not found" }, status));
    const err = await sdk.migration
      .migrationStatus("a1")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MigrationHttpError);
    expect((err as MigrationHttpError).status).toBe(status);
  });
});
