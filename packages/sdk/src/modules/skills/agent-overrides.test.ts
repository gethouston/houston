import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { AgentSkillsHttpError } from "./index";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

function agentHost(
  options: {
    holdsCopy?: boolean;
    failManifestPut?: boolean;
    deleteStatus?: number;
  } = {},
) {
  const calls: Recorded[] = [];
  let enabled: string[] = ["invoices"];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? init.body : null;
      const url = String(input);
      calls.push({ method, url, body });
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (new URL(url).pathname.endsWith("/skills-manifest")) {
        if (method === "PUT") {
          if (options.failManifestPut === true)
            return json({ error: "read-only" }, 403);
          enabled = (JSON.parse(body ?? "{}") as { enabled: string[] }).enabled;
        }
        return json({ version: 1, enabled });
      }
      const status =
        options.deleteStatus ?? (options.holdsCopy === true ? 200 : 404);
      return status === 200
        ? json({ ok: true })
        : json({ error: "skill not found" }, status);
    },
  );
  const store = new Map<string, string>();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    devicePreferences: memoryKv(),
    storage: {
      get: async (k) => store.get(k) ?? null,
      set: async (k, v) => void store.set(k, v),
      delete: async (k) => void store.delete(k),
    },
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  return { sdk: new HoustonSdk(config), calls, read: () => enabled };
}

const trace = (calls: readonly Recorded[]) =>
  calls.map((call) => `${call.method} ${new URL(call.url).pathname}`);

describe("putting an agent back on the workspace version of a skill", () => {
  it("switches the entry on BEFORE it drops the agent's own copy", async () => {
    const { sdk, calls, read } = agentHost({ holdsCopy: true });

    await sdk.skills.agent.revertSkillOverride("a1", "triage");

    expect(trace(calls)).toEqual([
      "GET /agents/a1/skills-manifest",
      "PUT /agents/a1/skills-manifest",
      "DELETE /agents/a1/skills/triage",
    ]);
    expect(read()).toEqual(["invoices", "triage"]);
  });

  it("keeps the copy when the entry could not be switched on", async () => {
    const { sdk, calls } = agentHost({
      holdsCopy: true,
      failManifestPut: true,
    });

    await expect(
      sdk.skills.agent.revertSkillOverride("a1", "triage"),
    ).rejects.toBeInstanceOf(AgentSkillsHttpError);

    expect(trace(calls)).not.toContain("DELETE /agents/a1/skills/triage");
  });
});

describe("taking a workspace skill off one agent", () => {
  it("switches the entry off, THEN drops the copy that would still load", async () => {
    const { sdk, calls, read } = agentHost({ holdsCopy: true });

    await sdk.skills.agent.disableSkillForAgent("a1", "invoices");

    expect(trace(calls)).toEqual([
      "GET /agents/a1/skills-manifest",
      "PUT /agents/a1/skills-manifest",
      "DELETE /agents/a1/skills/invoices",
    ]);
    expect(read()).toEqual([]);
  });

  it("is finished, not failed, when the agent kept no copy of its own", async () => {
    const { sdk, read } = agentHost({ holdsCopy: false });

    await expect(
      sdk.skills.agent.disableSkillForAgent("a1", "invoices"),
    ).resolves.toBeUndefined();
    expect(read()).toEqual([]);
  });

  it("never reports a delete that failed for any other reason as done", async () => {
    const { sdk } = agentHost({ deleteStatus: 403 });

    await expect(
      sdk.skills.agent.disableSkillForAgent("a1", "invoices"),
    ).rejects.toBeInstanceOf(AgentSkillsHttpError);
  });
});

describe("what these acts publish to the assistant's catalog", () => {
  it("claims nothing there, because they reach no route of their own", () => {
    const source = readFileSync(
      new URL("./agent-overrides.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("@assistant");
  });
});

describe("the queue these acts share with the single switch", () => {
  it("never lets a switch started alongside them drop their manifest write", async () => {
    const { sdk, read } = agentHost({ holdsCopy: true });

    await Promise.all([
      sdk.skills.agent.disableSkillForAgent("a1", "invoices"),
      sdk.skills.agent.setSkillEnabled("a1", "triage", true),
    ]);

    expect(read()).toEqual(["triage"]);
  });
});
