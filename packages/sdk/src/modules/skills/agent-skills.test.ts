import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { AgentSkillsCommand, AgentSkillsHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

/** A skill summary as the HOST sends it — without the two legacy fields. */
const HOST_SUMMARY = {
  name: "triage",
  title: "Triage",
  description: "Sort the inbox",
  version: 1,
  tags: ["inbox"],
  created: "2026-01-01T00:00:00.000Z",
  lastUsed: null,
  category: null,
  featured: false,
  integrations: ["gmail"],
  image: null,
};

const DETAIL = {
  name: "triage",
  title: "Triage",
  description: "Sort the inbox",
  version: 1,
  content: "# Triage\n",
};

/**
 * A skills SDK over a mock `fetch` that records the whole wire. `reactivity` is
 * off, so every recorded call is one a skills operation made and nothing else —
 * which is what makes "exactly one request" an exact claim.
 */
function makeSdk(answer: (path: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push({
        method: init?.method ?? "GET",
        url,
        body: typeof init?.body === "string" ? init.body : null,
      });
      return answer(new URL(url).pathname);
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
    },
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls };
}

const json = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? {} : { "content-type": "application/json" },
  });

const ok = (body: unknown) => makeSdk(() => json(body));

describe("the agent-skills requests", () => {
  it("lists an agent's skills and restores the legacy fields", async () => {
    const { sdk, calls } = ok({ items: [HOST_SUMMARY] });

    expect(await sdk.skills.agent.listSkills("a1")).toEqual([
      { ...HOST_SUMMARY, inputs: [], promptTemplate: null },
    ]);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/agents/a1/skills`, body: null },
    ]);
  });

  it("reads one skill's instructions off its slug", async () => {
    const { sdk, calls } = ok(DETAIL);

    expect(await sdk.skills.agent.loadSkill("a1", "triage")).toEqual(DETAIL);
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/agents/a1/skills/triage`, body: null },
    ]);
  });

  it("creates a skill with the whole body in one POST", async () => {
    const { sdk, calls } = ok({});

    await sdk.skills.agent.createSkill("a1", {
      name: "Triage",
      description: "Sort the inbox",
      content: "# Triage\n",
    });
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/a1/skills`,
        body: JSON.stringify({
          name: "Triage",
          description: "Sort the inbox",
          content: "# Triage\n",
        }),
      },
    ]);
  });

  it("saves a skill by sending only its new text", async () => {
    const { sdk, calls } = ok({});

    await sdk.skills.agent.saveSkill("a1", "triage", "# New\n");
    expect(calls).toEqual([
      {
        method: "PUT",
        url: `${BASE}/agents/a1/skills/triage`,
        body: JSON.stringify({ content: "# New\n" }),
      },
    ]);
  });

  it("deletes a skill with no body", async () => {
    const { sdk, calls } = makeSdk(() => json(null, 204));

    await sdk.skills.agent.deleteSkill("a1", "triage");
    expect(calls).toEqual([
      { method: "DELETE", url: `${BASE}/agents/a1/skills/triage`, body: null },
    ]);
  });

  it("reads and replaces the manifest, echoing what the host stored", async () => {
    const manifest = { version: 1 as const, enabled: ["triage"] };
    const { sdk, calls } = ok(manifest);

    expect(await sdk.skills.agent.getSkillsManifest("a1")).toEqual(manifest);
    expect(await sdk.skills.agent.putSkillsManifest("a1", manifest)).toEqual(
      manifest,
    );
    expect(calls).toEqual([
      { method: "GET", url: `${BASE}/agents/a1/skills-manifest`, body: null },
      {
        method: "PUT",
        url: `${BASE}/agents/a1/skills-manifest`,
        body: JSON.stringify(manifest),
      },
    ]);
  });

  it("percent-encodes the agent id and the slug into their own segments", async () => {
    const { sdk, calls } = ok(DETAIL);

    await sdk.skills.agent.loadSkill("a/1", "my skill/v2");
    expect(calls[0].url).toBe(`${BASE}/agents/a%2F1/skills/my%20skill%2Fv2`);
  });
});

describe("how an agent-skills request fails", () => {
  it("throws the module's own error carrying the host's status", async () => {
    const { sdk } = makeSdk(() => json({ error: "no such agent" }, 404));

    const err = await sdk.skills.agent
      .listSkills("gone")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentSkillsHttpError);
    expect((err as AgentSkillsHttpError).status).toBe(404);
    expect((err as AgentSkillsHttpError).message).toContain("no such agent");
  });

  it("never degrades a failed write to a silent success", async () => {
    const { sdk } = makeSdk(() => json({ error: "read-only" }, 403));

    await expect(
      sdk.skills.agent.deleteSkill("a1", "triage"),
    ).rejects.toBeInstanceOf(AgentSkillsHttpError);
  });
});

describe("the dispatch path", () => {
  it("dispatches every skills command to the same handler", async () => {
    const { sdk, calls } = ok({ items: [] });

    const res = await sdk.dispatch({
      id: "1",
      type: AgentSkillsCommand.List,
      payload: { agentId: "a1" },
    });
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe(`${BASE}/agents/a1/skills`);
  });

  it("refuses a manifest whose enabled list is not slugs", async () => {
    const { sdk, calls } = ok({});

    const res = await sdk.dispatch({
      id: "2",
      type: AgentSkillsCommand.PutManifest,
      payload: { agentId: "a1", manifest: { version: 1, enabled: [7] } },
    });
    // Coercing would have switched that skill OFF for the agent, so nothing
    // reaches the wire at all.
    expect(res.ok).toBe(false);
    expect(calls).toEqual([]);
  });
});
