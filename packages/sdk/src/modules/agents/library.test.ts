import { expect, test, vi } from "vitest";
import type { SdkPorts } from "../../ports";
import { agentsScope } from "./http";
import {
  installAgentFromGithub,
  listInstalledConfigs,
  updateAgentColor,
} from "./library";

/**
 * The account-scoped agent routes, at the wire.
 *
 * `updateAgentColor` is the single-request host leaf the personal assistant
 * dispatches, and the generated operation catalog derives its route from this
 * exact call shape — so the path, the verb, the per-segment escaping and the
 * body are all load-bearing, not incidental.
 */

interface Call {
  url: string;
  method: string;
  body: string | null;
}

function scope(respond: (url: string) => Response = () => ok()) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : null,
    });
    return respond(url);
  }) as unknown as typeof fetch;
  const ports = { fetch: fetchImpl } as unknown as SdkPorts;
  return { calls, scope: agentsScope("http://cp", ports, () => {}) };
}

function ok(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("updateAgentColor PUTs the color to the agent's own color address", async () => {
  const { calls, scope: s } = scope();

  await updateAgentColor(s, "Home/Bob", "teal");

  expect(calls).toEqual([
    {
      url: "http://cp/v1/agents/Home%2FBob/color",
      method: "PUT",
      body: '{"color":"teal"}',
    },
  ]);
});

test("updateAgentColor escapes the agent id into one path segment", async () => {
  const { calls, scope: s } = scope();

  await updateAgentColor(s, "Home/Bob & Co", "crimson");

  expect(calls[0]?.url).toBe("http://cp/v1/agents/Home%2FBob%20%26%20Co/color");
});

test("listInstalledConfigs reads the account library", async () => {
  const { calls, scope: s } = scope(() =>
    ok([{ config: { name: "helper" }, path: "helper" }]),
  );

  await expect(listInstalledConfigs(s)).resolves.toEqual([
    { config: { name: "helper" }, path: "helper" },
  ]);
  expect(calls).toEqual([
    { url: "http://cp/v1/agent-configs", method: "GET", body: null },
  ]);
});

test("the library read never degrades — a 404 is the caller's to read", async () => {
  // A deployment with no account-level library answers 404; the SDK reports the
  // status and the surface decides what it means (web shows the bundled
  // templates). Swallowing it here would hide a real outage from iOS too.
  const { scope: s } = scope(() => new Response("not found", { status: 404 }));

  await expect(listInstalledConfigs(s)).rejects.toMatchObject({ status: 404 });
});

test("installAgentFromGithub posts the repository url", async () => {
  const { calls, scope: s } = scope(() => ok({ agentId: "a1" }));

  await expect(
    installAgentFromGithub(s, "https://github.com/a/b"),
  ).resolves.toEqual({ agentId: "a1" });
  expect(calls).toEqual([
    {
      url: "http://cp/v1/agents/install-from-github",
      method: "POST",
      body: '{"githubUrl":"https://github.com/a/b"}',
    },
  ]);
});
