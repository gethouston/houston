import { bus } from "@houston/engine-adapter/bus";
import { HoustonClient } from "@houston/engine-adapter/client";
import { HoustonEngineError } from "@houston/engine-adapter/client/errors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  type Call,
  createWireCapture,
  ORG as ORG_SLUG,
} from "./support/wire-capture";

const BASE = "https://gw.example";
const WS = "org:acme";
const WS_PATH = `${BASE}/v1/workspaces/org%3Aacme/shared-skills`;

const DETAIL = {
  name: "brand-voice",
  title: "Brand voice",
  description: "How we write",
  version: 1,
  content: "# Brand voice",
};

let echoes: string[];
let unsubscribe: () => void;

const { calls, reset, restore, stubFetch } = createWireCapture();

beforeEach(() => {
  reset();
  echoes = [];
  unsubscribe = bus.on((event) => {
    const type = (event as { type?: unknown }).type;
    if (typeof type === "string") echoes.push(type);
  });
});

afterEach(() => {
  unsubscribe();
  restore();
  vi.clearAllMocks();
});

const json = (status: number, body: unknown = {}): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "Content-Type": "application/json" },
  });

function client(): HoustonClient {
  const c = new HoustonClient({
    baseUrl: BASE,
    token: "t",
    controlPlane: true,
  });
  c.setActiveOrg(ORG_SLUG);
  return c;
}

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
