import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SdkConfig, SdkPorts } from "../../ports";
import { HoustonSdk } from "../../sdk";
import { memoryKv } from "../../test-ports";
import { AgentSkillsHttpError } from "./index";

/**
 * An agent's own copy of a workspace skill loads whether or not the manifest
 * names it, so putting the agent back on the workspace version and taking the
 * workspace skill off the agent are each TWO writes. What makes them right is
 * the order: the copy is the only thing here nothing can restore, so it goes
 * last, after the reversible manifest write has landed.
 */

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

/**
 * A host holding one agent's manifest and, optionally, that agent's own copy
 * of the skill. `holdsCopy: false` is the agent that only ever loaded the
 * workspace version — its DELETE answers 404, exactly as the host does.
 */
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
      // A round trip the caller waits for, so two acts on one agent can
      // genuinely interleave when nothing serializes them.
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

/** Each call as `METHOD path`, which is what the ordering claims read on. */
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
    // Otherwise the agent is left with neither version of the skill while the
    // toast says it is on the workspace one.
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
    // The catalog is extracted from the functions that ISSUE a request; these
    // two compose the manifest write and the delete, so an `@assistant` tag on
    // them is read by nothing while it reads as a decision somebody made.
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

    // Unqueued, both would have read ["invoices"] before either wrote, and the
    // second write would have restored what the first took off.
    expect(read()).toEqual(["triage"]);
  });
});
