import { describe, expect, it, vi } from "vitest";
import { createAuthExpiryNotifier } from "../../auth-expiry";
import { CommandRegistry } from "../../commands";
import type { ModuleContext } from "../../module-context";
import type { SdkConfig, SdkPorts } from "../../ports";
import { ScopeStore } from "../../store";
import { createMarketplace } from "./marketplace";
import { MarketplaceCommand, MarketplaceHttpError } from "./types-marketplace";

const BASE = "http://127.0.0.1:4318";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
  signal: AbortSignal | null | undefined;
}

/**
 * The marketplace over a mock `fetch`, built on a bare {@link ModuleContext}
 * rather than the whole SDK: it is mounted INSIDE the skills facade
 * (`sdk.skills.marketplace`), so the factory is the unit, and every assertion
 * here is about the exact agent-scoped URL, method and body bytes that reach
 * the wire — the hosted gateway proxies nothing but `/agents/:slug/*`, so a
 * path that loses the agent has no pod to land on.
 */
function makeMarketplace(respond: (url: string) => Response) {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: (init?.method ?? "GET").toUpperCase(),
        url: String(input),
        body: typeof init?.body === "string" ? init.body : null,
        signal: init?.signal,
      });
      return respond(String(input));
    },
  );
  const store = new ScopeStore();
  const ports: SdkPorts = {
    fetch: fetchImpl as unknown as typeof fetch,
    storage: {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    },
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
  const config: SdkConfig = { baseUrl: BASE, ports, reactivity: false };
  const commands = new CommandRegistry();
  const ctx: ModuleContext = {
    config,
    store,
    clientFor: () => {
      throw new Error("the marketplace never uses the runtime client");
    },
    authExpiry: createAuthExpiryNotifier(store),
    registerCommand: (type, handler) => commands.register(type, handler),
  };
  return { marketplace: createMarketplace(ctx), calls, commands };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const HIT = {
  id: "h1",
  skillId: "inbox-triage",
  name: "Inbox triage",
  installs: 12,
  source: "skills.sh/acme",
};

const REPO_SKILL = {
  id: "weekly-report",
  name: "Weekly report",
  description: "",
  path: "skills/weekly-report",
};

describe("skills marketplace — the community directory and GitHub repos", () => {
  it("searches the community directory under the agent's own scope", async () => {
    const { marketplace, calls } = makeMarketplace(() => json([HIT]));

    await expect(
      marketplace.searchCommunitySkills("Houston/Growth", "research"),
    ).resolves.toEqual([HIT]);
    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/Houston%2FGrowth/skills/community/search`,
        body: JSON.stringify({ query: "research" }),
        signal: undefined,
      },
    ]);
  });

  it("previews one catalogue entry by its source and skill id", async () => {
    const preview = {
      title: "Inbox triage",
      description: "Sorts the morning mail.",
      image: null,
      category: null,
      tags: ["email"],
      integrations: ["gmail"],
      content: "# Inbox triage",
    };
    const { marketplace, calls } = makeMarketplace(() => json(preview));

    await expect(
      marketplace.previewCommunitySkill("a1", "skills.sh/acme", "inbox-triage"),
    ).resolves.toEqual(preview);
    expect(calls[0].url).toBe(`${BASE}/agents/a1/skills/community/preview`);
    expect(calls[0].body).toBe(
      JSON.stringify({ source: "skills.sh/acme", skillId: "inbox-triage" }),
    );
  });

  it("lists a repository's skills and installs the chosen ones", async () => {
    const { marketplace, calls } = makeMarketplace((url) =>
      url.endsWith("/repo/list") ? json([REPO_SKILL]) : json(["weekly-report"]),
    );

    await expect(
      marketplace.listSkillsFromRepo("a1", "https://github.com/acme/skills"),
    ).resolves.toEqual([REPO_SKILL]);
    await expect(
      marketplace.installSkillsFromRepo("a1", {
        source: "https://github.com/acme/skills",
        skills: [REPO_SKILL],
      }),
    ).resolves.toEqual(["weekly-report"]);

    expect(calls.map((call) => `${call.method} ${call.url}`)).toEqual([
      `POST ${BASE}/agents/a1/skills/repo/list`,
      `POST ${BASE}/agents/a1/skills/repo/install`,
    ]);
    expect(calls[1].body).toBe(
      JSON.stringify({
        source: "https://github.com/acme/skills",
        skills: [REPO_SKILL],
      }),
    );
  });

  it("installs one community skill and answers its slug", async () => {
    const { marketplace, calls } = makeMarketplace(() => json("inbox-triage"));

    await expect(
      marketplace.installCommunitySkill("a1", {
        source: "skills.sh/acme",
        skillId: "inbox-triage",
      }),
    ).resolves.toBe("inbox-triage");
    expect(calls[0].url).toBe(`${BASE}/agents/a1/skills/community/install`);
    expect(calls[0].body).toBe(
      JSON.stringify({ source: "skills.sh/acme", skillId: "inbox-triage" }),
    );
  });

  it("threads the caller's abort signal down to the request", async () => {
    const { marketplace, calls } = makeMarketplace(() => json([]));
    const controller = new AbortController();

    await marketplace.searchCommunitySkills("a1", "q", controller.signal);

    expect(calls[0].signal).toBe(controller.signal);
  });

  it("throws the host's reason with its status — never an empty catalogue", async () => {
    const { marketplace } = makeMarketplace(() =>
      json({ error: "skills.sh unavailable" }, 502),
    );

    const err = await marketplace
      .searchCommunitySkills("a1", "q")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MarketplaceHttpError);
    expect((err as MarketplaceHttpError).status).toBe(502);
    expect((err as Error).message).toContain("skills.sh unavailable");
  });

  it("registers every operation as a bridge command", () => {
    const { commands } = makeMarketplace(() => json([]));

    for (const type of Object.values(MarketplaceCommand))
      expect(commands.has(type), type).toBe(true);
  });

  it("dispatches a command, and refuses a payload the host would write to disk", async () => {
    const { commands, calls } = makeMarketplace(() => json(["weekly-report"]));

    await expect(
      commands.dispatch({
        id: "1",
        type: MarketplaceCommand.InstallFromRepo,
        payload: {
          agentId: "a1",
          body: { source: "https://github.com/acme/skills", skills: [] },
        },
      }),
    ).resolves.toEqual({ id: "1", ok: true, value: ["weekly-report"] });

    // A skill missing the `path` the host writes it to never reaches the wire.
    const refused = await commands.dispatch({
      id: "2",
      type: MarketplaceCommand.InstallFromRepo,
      payload: {
        agentId: "a1",
        body: { source: "s", skills: [{ id: "x", name: "X" }] },
      },
    });
    expect(refused.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
