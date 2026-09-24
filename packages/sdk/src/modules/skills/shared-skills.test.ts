import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { SharedSkillsCommand, SharedSkillsHttpError } from "./types-shared";

const BASE = "http://127.0.0.1:4317";
const WS = `${BASE}/v1/workspaces/Houston/shared-skills`;

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/**
 * An inert SDK (`reactivity:false`) over a mock `fetch` that records the whole
 * request and answers whatever the test queues. The shared-skill routes are
 * workspace-scoped, so every assertion here is about the exact URL, method and
 * body bytes that reach the wire — and about the fact that nothing is
 * swallowed: a 404 (an unknown workspace, an unknown slug) belongs to the
 * CALLER, never to this module, or a surface would be handed an empty library
 * it cannot tell from a real one.
 */
function makeSdk(respond: (url: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return respond(String(input));
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

const json = (body: unknown, status = 200): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "content-type": "application/json" },
  });

const DETAIL = {
  name: "brand-voice",
  title: "Brand voice",
  description: "How we write",
  version: 1,
  content: "# Brand voice",
};

describe("shared skills — reading the workspace library", () => {
  it("lists the library and restores the two fields v3 dropped", async () => {
    const host = { name: "brand-voice", title: null, version: 1 };
    const { sdk, calls } = makeSdk(() =>
      json({ items: [host], diagnostics: [{ key: "bad", message: "no" }] }),
    );

    await expect(
      sdk.skills.shared.listSharedSkills("Houston"),
    ).resolves.toEqual({
      items: [{ ...host, inputs: [], promptTemplate: null }],
      diagnostics: [{ key: "bad", message: "no" }],
    });
    expect(calls).toEqual([{ method: "GET", url: WS, body: null }]);
  });

  it("reads one skill off the item route", async () => {
    const { sdk, calls } = makeSdk(() => json(DETAIL));

    await expect(
      sdk.skills.shared.loadSharedSkill("Houston", "brand-voice"),
    ).resolves.toEqual(DETAIL);
    expect(calls).toEqual([
      { method: "GET", url: `${WS}/brand-voice`, body: null },
    ]);
  });

  it("escapes the workspace id and the slug, one segment each", async () => {
    const { sdk, calls } = makeSdk(() => json(DETAIL));

    await sdk.skills.shared.loadSharedSkill("org:a/c", "brand/voice ✨");

    expect(calls[0].url).toBe(
      `${BASE}/v1/workspaces/org%3Aa%2Fc/shared-skills/brand%2Fvoice%20%E2%9C%A8`,
    );
  });

  it("propagates a 404 instead of degrading — the caller decides", async () => {
    const missing = makeSdk(() => json({ error: "not found" }, 404));
    await expect(
      missing.sdk.skills.shared.listSharedSkills("Houston"),
    ).rejects.toBeInstanceOf(SharedSkillsHttpError);

    const slug = makeSdk(() => json({ error: "not found" }, 404));
    await expect(
      slug.sdk.skills.shared.loadSharedSkill("Houston", "gone"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("shared skills — writing to the library", () => {
  it("creates on the collection and promotes on the item route", async () => {
    const { sdk, calls } = makeSdk(() => json(DETAIL));

    await sdk.skills.shared.createSharedSkill("Houston", {
      name: "brand-voice",
      description: "How we write",
      content: "# Brand voice",
    });
    await sdk.skills.shared.promoteSharedSkill(
      "Houston",
      "brand-voice",
      "# Brand voice",
    );

    expect(calls).toEqual([
      {
        method: "POST",
        url: WS,
        body: JSON.stringify({
          name: "brand-voice",
          description: "How we write",
          content: "# Brand voice",
        }),
      },
      {
        method: "POST",
        url: `${WS}/brand-voice`,
        body: JSON.stringify({ content: "# Brand voice" }),
      },
    ]);
  });

  it("saves with the content alone and deletes with no body", async () => {
    const { sdk, calls } = makeSdk(() => json({}, 204));

    await sdk.skills.shared.saveSharedSkill("Houston", "brand-voice", "# New");
    await sdk.skills.shared.deleteSharedSkill("Houston", "brand-voice");

    expect(calls).toEqual([
      {
        method: "PUT",
        url: `${WS}/brand-voice`,
        body: JSON.stringify({ content: "# New" }),
      },
      { method: "DELETE", url: `${WS}/brand-voice`, body: null },
    ]);
  });
});

describe("shared skills — the dispatch path", () => {
  it("dispatches the same handlers the facade calls", async () => {
    const { sdk, calls } = makeSdk(() => json(DETAIL));

    const result = await sdk.dispatch({
      id: "1",
      type: SharedSkillsCommand.Save,
      payload: { workspaceId: "Houston", slug: "brand-voice", content: "# S" },
    });

    expect(result.ok).toBe(true);
    expect(calls[0]).toEqual({
      method: "PUT",
      url: `${WS}/brand-voice`,
      body: JSON.stringify({ content: "# S" }),
    });
  });

  it("creates from a payload whose description the caller left out", async () => {
    const { sdk, calls } = makeSdk(() => json(DETAIL));

    const result = await sdk.dispatch({
      id: "2",
      type: SharedSkillsCommand.Create,
      payload: { workspaceId: "Houston", body: { name: "b", content: "# S" } },
    });

    expect(result.ok).toBe(true);
    expect(calls[0].body).toBe(
      JSON.stringify({ name: "b", description: "", content: "# S" }),
    );
  });

  it("refuses a command payload that names no workspace", async () => {
    const { sdk, calls } = makeSdk(() => json(DETAIL));

    const result = await sdk.dispatch({
      id: "3",
      type: SharedSkillsCommand.Delete,
      payload: { slug: "brand-voice" },
    });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
