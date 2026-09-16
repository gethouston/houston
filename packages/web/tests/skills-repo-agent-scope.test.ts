import { HoustonClient } from "@houston/engine-adapter/client";
import { afterEach, expect, test, vi } from "vitest";

/**
 * The hosted gateway proxies nothing but `/agents/:slug/*` — a top-level
 * `/v1/skills/*` has no pod to land on and 404s, which broke the Add Skills
 * dialog's GitHub repo lookup against the cloud. The read must ride the same
 * agent scope the install already uses; the host serves that agent-scoped
 * route too (packages/host/src/routes/skills-remote.ts), so the shape holds
 * for the local sidecar as well.
 *
 * Driven through the composed client, which is where the repo listing reaches
 * `sdk.skills.repo` — the agent scope is a property of the URL the app puts on
 * the wire, not of whichever layer builds it.
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

const client = () =>
  new HoustonClient({
    baseUrl: "https://gateway.example",
    token: "t",
    controlPlane: true,
  });

test("GitHub repo listing rides the agent scope the gateway can proxy", async () => {
  const calls = stubFetch(json(200, []));

  await client().listSkillsFromRepo("Houston/Growth", "owner/repo");

  expect(calls).toEqual([
    "https://gateway.example/agents/Houston%2FGrowth/skills/repo/list",
  ]);
});

test("a repo-listing failure surfaces with the host's reason — never swallowed", async () => {
  stubFetch(json(502, { error: "GitHub unavailable" }));

  await expect(
    client().listSkillsFromRepo("Houston/Growth", "owner/repo"),
  ).rejects.toThrow("GitHub unavailable (engine error 502)");
});
