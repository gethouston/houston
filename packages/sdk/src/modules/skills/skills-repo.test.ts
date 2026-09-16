import { describe, expect, it, vi } from "vitest";
import { createAuthExpiryNotifier } from "../../auth-expiry";
import { CommandRegistry } from "../../commands";
import type { ModuleContext } from "../../module-context";
import type { SdkConfig, SdkPorts } from "../../ports";
import { ScopeStore } from "../../store";
import { createSkillsRepo } from "./skills-repo";
import { SkillsRepoCommand, SkillsRepoHttpError } from "./types-skills-repo";

const BASE = "http://127.0.0.1:4318";

interface Recorded {
  method: string;
  url: string;
  body: string | null;
  signal: AbortSignal | null | undefined;
}

/**
 * The repository module over a mock `fetch`, built on a bare
 * {@link ModuleContext} rather than the whole SDK: it is mounted INSIDE the
 * skills facade (`sdk.skills.repo`), so the factory is the unit, and every
 * assertion here is about the exact agent-scoped URL, method and body bytes
 * that reach the wire — the hosted gateway proxies nothing but
 * `/agents/:slug/*`, so a path that loses the agent has no pod to land on.
 */
function makeSkillsRepo(respond: (url: string) => Response) {
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
      throw new Error("the repository module never uses the runtime client");
    },
    authExpiry: createAuthExpiryNotifier(store),
    registerCommand: (type, handler) => commands.register(type, handler),
  };
  return { repo: createSkillsRepo(ctx), calls, commands };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const REPO_SKILL = {
  id: "weekly-report",
  name: "Weekly report",
  description: "",
  path: "skills/weekly-report",
};

describe("skills from a GitHub repository", () => {
  it("lists a repository's skills and installs the chosen ones", async () => {
    const { repo, calls } = makeSkillsRepo((url) =>
      url.endsWith("/repo/list") ? json([REPO_SKILL]) : json(["weekly-report"]),
    );

    await expect(
      repo.listSkillsFromRepo("a1", "https://github.com/acme/skills"),
    ).resolves.toEqual([REPO_SKILL]);
    await expect(
      repo.installSkillsFromRepo("a1", {
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

  it("escapes the agent id so a slug with a slash keeps its pod", async () => {
    const { repo, calls } = makeSkillsRepo(() => json([REPO_SKILL]));

    await repo.listSkillsFromRepo("Houston/Growth", "acme/skills");

    expect(calls).toEqual([
      {
        method: "POST",
        url: `${BASE}/agents/Houston%2FGrowth/skills/repo/list`,
        body: JSON.stringify({ source: "acme/skills" }),
        signal: undefined,
      },
    ]);
  });

  it("threads the caller's abort signal down to the request", async () => {
    const { repo, calls } = makeSkillsRepo(() => json([]));
    const controller = new AbortController();

    await repo.listSkillsFromRepo("a1", "acme/skills", controller.signal);

    expect(calls[0].signal).toBe(controller.signal);
  });

  it("throws the host's reason with its status — never an empty listing", async () => {
    const { repo } = makeSkillsRepo(() =>
      json({ error: "GitHub unavailable" }, 502),
    );

    const err = await repo
      .listSkillsFromRepo("a1", "acme/skills")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SkillsRepoHttpError);
    expect((err as SkillsRepoHttpError).status).toBe(502);
    expect((err as Error).message).toContain("GitHub unavailable");
  });

  it("registers every operation as a bridge command", () => {
    const { commands } = makeSkillsRepo(() => json([]));

    for (const type of Object.values(SkillsRepoCommand))
      expect(commands.has(type), type).toBe(true);
  });

  it("dispatches a command, and refuses a payload the host would write to disk", async () => {
    const { commands, calls } = makeSkillsRepo(() => json(["weekly-report"]));

    await expect(
      commands.dispatch({
        id: "1",
        type: SkillsRepoCommand.InstallFromRepo,
        payload: {
          agentId: "a1",
          body: { source: "https://github.com/acme/skills", skills: [] },
        },
      }),
    ).resolves.toEqual({ id: "1", ok: true, value: ["weekly-report"] });

    // A skill missing the `path` the host writes it to never reaches the wire.
    const refused = await commands.dispatch({
      id: "2",
      type: SkillsRepoCommand.InstallFromRepo,
      payload: {
        agentId: "a1",
        body: { source: "s", skills: [{ id: "x", name: "X" }] },
      },
    });
    expect(refused.ok).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
