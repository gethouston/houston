import { afterEach, expect, test, vi } from "vitest";
import {
  listSkillsFromRepo,
  searchCommunitySkills,
} from "../src/engine-adapter/control-plane";

/**
 * The hosted gateway proxies nothing but `/agents/:slug/*` — a top-level
 * `/v1/skills/*` has no pod to land on and 404s, which broke every Add Skills
 * marketplace read against the cloud (skills.sh suggestions/search AND the
 * GitHub repo lookup). The reads must ride the same agent scope installs
 * already use; the host serves those agent-scoped routes too
 * (packages/host/src/routes/skills-remote.ts), so the shape holds for the
 * local sidecar as well.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function json(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Stub fetch with a queue of responses; records every requested url. */
function stubFetch(...responses: Response[]) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("stubFetch: no responses left");
    return next;
  }) as unknown as typeof fetch;
  return calls;
}

const CFG = { baseUrl: "https://gateway.example", token: "t" };

test("community search rides the agent scope the gateway can proxy", async () => {
  const calls = stubFetch(json(200, []));

  await searchCommunitySkills(CFG, "Houston/Growth", "research");

  expect(calls).toEqual([
    "https://gateway.example/agents/Houston%2FGrowth/skills/community/search",
  ]);
});

test("GitHub repo listing rides the agent scope the gateway can proxy", async () => {
  const calls = stubFetch(json(200, []));

  await listSkillsFromRepo(CFG, "Houston/Growth", "owner/repo");

  expect(calls).toEqual([
    "https://gateway.example/agents/Houston%2FGrowth/skills/repo/list",
  ]);
});

test("a marketplace failure surfaces with the host's reason — never swallowed", async () => {
  stubFetch(json(502, { error: "skills.sh unavailable" }));

  await expect(
    searchCommunitySkills(CFG, "Houston/Growth", "research"),
  ).rejects.toThrow("skills.sh unavailable (engine error 502)");
});
