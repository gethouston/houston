import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { bus } from "../src/engine-adapter/bus";
import { HoustonClient } from "../src/engine-adapter/client";
import { HoustonEngineError } from "../src/engine-adapter/client/errors";

/**
 * Wave C2b — the workspace-shared skill library moves to `sdk.skills.shared`,
 * and `cp/shared-skills.ts` is gone. What has to survive that is the WIRE: six
 * routes over one collection and one item path, their methods, their exact
 * bodies, the headers carrying auth and the active space, and the encoding of
 * the two ids spliced into every path — a team workspace id (`org:<slug>`) and
 * a slug, neither of which is URL-safe on its own.
 *
 * Each case drives the composed `HoustonClient` (what the app holds), not the
 * SDK, and asserts the whole recorded request: a substring match would let the
 * collection route stand in for the item route, which is the difference between
 * creating a skill and promoting one.
 *
 * Nothing in this family degrades — the host serves every one of these routes,
 * so a 404 is a real failure and must reach the caller as it always did.
 */

const BASE = "https://gw.example";
const ORG_SLUG = "abcdef0123456789"; // [a-f0-9]{16}
const WS = "org:acme";
const WS_PATH = `${BASE}/v1/workspaces/org%3Aacme/shared-skills`;

const DETAIL = {
  name: "brand-voice",
  title: "Brand voice",
  description: "How we write",
  version: 1,
  content: "# Brand voice",
};

interface Call {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

let calls: Call[];
/** Invalidation echoes the adapter pushed onto its own bus, newest last. */
let echoes: string[];
let unsubscribe: () => void;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  echoes = [];
  unsubscribe = bus.on((event) => {
    const type = (event as { type?: unknown }).type;
    if (typeof type === "string") echoes.push(type);
  });
});

afterEach(() => {
  unsubscribe();
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

/** Answer every request with `make()`, recording what was asked. */
function stubFetch(make: () => Response) {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    return make();
  }) as unknown as typeof fetch;
}

const json = (status: number, body: unknown = {}): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "Content-Type": "application/json" },
  });

/** A cloud client with a team space active, so `x-houston-org` is live. */
function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG_SLUG);
  return c;
}

/** The single request the call made, with the shared headers already checked. */
function soleCall(): Call {
  expect(calls).toHaveLength(1);
  const [call] = calls;
  expect(call.headers.get("Content-Type")).toBe("application/json");
  expect(call.headers.get("Authorization")).toBe("Bearer t");
  expect(call.headers.get("x-houston-org")).toBe(ORG_SLUG);
  return call;
}

describe("the delegated shared-skill requests", () => {
  test("listSharedSkills GETs the library and restores the legacy fields", async () => {
    const host = { name: "brand-voice", title: null, version: 1 };
    stubFetch(() => json(200, { items: [host], diagnostics: [] }));

    expect(await client().listSharedSkills(WS)).toEqual({
      items: [{ ...host, inputs: [], promptTemplate: null }],
      diagnostics: [],
    });
    const call = soleCall();
    expect(call.method).toBe("GET");
    expect(call.url).toBe(WS_PATH);
    expect(call.body).toBeNull();
  });

  test("loadSharedSkill GETs the item route", async () => {
    stubFetch(() => json(200, DETAIL));
    expect(await client().loadSharedSkill(WS, "brand-voice")).toEqual(DETAIL);
    const call = soleCall();
    expect(call.method).toBe("GET");
    expect(call.url).toBe(`${WS_PATH}/brand-voice`);
    expect(call.body).toBeNull();
  });

  test("createSharedSkill POSTs the collection with the three fields", async () => {
    stubFetch(() => json(201, DETAIL));
    expect(
      await client().createSharedSkill(WS, {
        workspacePath: "ignored",
        name: "brand-voice",
        description: "How we write",
        content: "# Brand voice",
      }),
    ).toEqual(DETAIL);
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(WS_PATH);
    expect(call.body).toBe(
      JSON.stringify({
        name: "brand-voice",
        description: "How we write",
        content: "# Brand voice",
      }),
    );
    expect(echoes).toEqual(["SharedSkillsChanged"]);
  });

  test("promoteSharedSkill POSTs the item route with only the content", async () => {
    stubFetch(() => json(200, DETAIL));
    expect(
      await client().promoteSharedSkill(WS, "brand-voice", "# Brand voice"),
    ).toEqual(DETAIL);
    const call = soleCall();
    expect(call.method).toBe("POST");
    expect(call.url).toBe(`${WS_PATH}/brand-voice`);
    expect(call.body).toBe(JSON.stringify({ content: "# Brand voice" }));
    expect(echoes).toEqual(["SharedSkillsChanged"]);
  });

  test("saveSharedSkill PUTs the item route with only the content", async () => {
    stubFetch(() => json(204));
    await client().saveSharedSkill(WS, "brand-voice", {
      workspacePath: "ignored",
      content: "# Newer",
    });
    const call = soleCall();
    expect(call.method).toBe("PUT");
    expect(call.url).toBe(`${WS_PATH}/brand-voice`);
    expect(call.body).toBe(JSON.stringify({ content: "# Newer" }));
    expect(echoes).toEqual(["SharedSkillsChanged"]);
  });

  test("deleteSharedSkill DELETEs the item route with no body", async () => {
    stubFetch(() => json(204));
    await client().deleteSharedSkill(WS, "brand-voice");
    const call = soleCall();
    expect(call.method).toBe("DELETE");
    expect(call.url).toBe(`${WS_PATH}/brand-voice`);
    expect(call.body).toBeNull();
    expect(echoes).toEqual(["SharedSkillsChanged"]);
  });
});

describe("what the delegation must not change", () => {
  test("both ids are percent-encoded, one segment each", async () => {
    stubFetch(() => json(200, DETAIL));
    await client().loadSharedSkill("org:a/c me", "brand/voice ✨");
    expect(soleCall().url).toBe(
      `${BASE}/v1/workspaces/org%3Aa%2Fc%20me/shared-skills/brand%2Fvoice%20%E2%9C%A8`,
    );
  });

  test("a 404 stays a HoustonEngineError, never a soft empty answer", async () => {
    stubFetch(() => json(404, { error: "workspace not found" }));
    await expect(client().listSharedSkills(WS)).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().listSharedSkills(WS)).rejects.toBeInstanceOf(
      HoustonEngineError,
    );
  });

  test("a write issues exactly one request — no post-write refetch", async () => {
    stubFetch(() => json(204));
    await client().deleteSharedSkill(WS, "brand-voice");
    expect(calls).toHaveLength(1);
  });
});
