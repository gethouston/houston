import { HoustonClient } from "@houston/engine-adapter/client";
import { runtimeClientFor } from "@houston/engine-adapter/cp/runtime-clients";
import { afterEach, expect, test } from "vitest";

const cfg = { baseUrl: "http://gw.test", token: "t" };

const credentials = () =>
  new HoustonClient({ ...cfg, controlPlane: true }).engineSdk.providers
    .credentials;

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

function capture() {
  const urls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    urls.push(String(url));
    return new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  restore = () => {
    globalThis.fetch = original;
  };
  return urls;
}

test("every credential write sends a bare, query-less URL", async () => {
  const urls = capture();
  const writes = credentials();
  await writes.captureCredential("agent-1", "anthropic");
  await writes.pushClaudeOAuthCredential("agent-1", "{}");
  await writes.forgetCredential("agent-1", "anthropic");
  await writes.setApiKey("agent-1", "openrouter", "k");
  await writes.setCustomEndpoint("agent-1", {
    baseUrl: "http://localhost:1234/v1",
    model: "local",
  });
  await writes.forgetSetupCredential("anthropic");
  expect(urls).toEqual([
    "http://gw.test/agents/agent-1/credential/capture",
    "http://gw.test/agents/agent-1/credential/claude-oauth",
    "http://gw.test/agents/agent-1/credential/forget",
    "http://gw.test/agents/agent-1/credential/api-key",
    "http://gw.test/agents/agent-1/provider/openai-compatible",
    "http://gw.test/setup-runtime/credential/forget",
  ]);
  for (const url of urls) {
    expect(url).not.toContain("?");
    expect(url).not.toContain("scope");
  }
});

test("the per-agent runtime client's auth routes carry no scope either", async () => {
  const urls = capture();
  const engine = runtimeClientFor(cfg, "agent-1");
  await engine.logout("anthropic");
  await engine.startLogin("anthropic").catch(() => {});
  await engine.startLogin("anthropic", false).catch(() => {});
  expect(urls).toEqual([
    "http://gw.test/agents/agent-1/auth/anthropic/logout",
    "http://gw.test/agents/agent-1/auth/anthropic/login",
    "http://gw.test/agents/agent-1/auth/anthropic/login?deviceAuth=false",
  ]);
  for (const url of urls) expect(url).not.toContain("scope");
});

test("the agent id is percent-encoded, and that is the whole URL", async () => {
  const urls = capture();
  await credentials().forgetCredential("Houston/Bo", "anthropic");
  expect(urls).toEqual([
    "http://gw.test/agents/Houston%2FBo/credential/forget",
  ]);
});
