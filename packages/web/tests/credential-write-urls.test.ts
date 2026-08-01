import { afterEach, expect, test } from "vitest";
import {
  captureCredential,
  forgetCredential,
  pushClaudeOAuthCredential,
  setApiKey,
  setCustomEndpoint,
} from "../src/engine-adapter/cp/credentials";
import { runtimeClientFor } from "../src/engine-adapter/cp/runtime-clients";

/**
 * HOU-976 personal-only, the URL contract: a credential write NEVER names an
 * account, in any form.
 *
 * WHOSE credential a call resolves to is decided entirely server-side, from the
 * space the request lands in — a team space has no shared AI account, so the
 * write is the acting member's own; a personal space has exactly one. A client
 * that also sent a scope could only restate that or contradict it, and the
 * shipped `?scope=personal` did the second: it churned every recorded/golden
 * request while adding nothing the gateway did not already know.
 *
 * This is a BYTE-IDENTITY test, not a shape test. Every URL below is asserted
 * whole, so a scope re-entering as a query param, a path segment or a second
 * query is a failure whichever form it takes.
 */

const cfg = { baseUrl: "http://gw.test", token: "t" };

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

/** Swap the global fetch (what `cpFetch` resolves at call time) and record URLs. */
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
  await captureCredential(cfg, "agent-1", "anthropic");
  await pushClaudeOAuthCredential(cfg, "agent-1", "{}");
  await forgetCredential(cfg, "agent-1", "anthropic");
  await setApiKey(cfg, "agent-1", "openrouter", "k");
  await setCustomEndpoint(cfg, "agent-1", {
    baseUrl: "http://localhost:1234/v1",
    model: "local",
  });
  expect(urls).toEqual([
    "http://gw.test/agents/agent-1/credential/capture",
    "http://gw.test/agents/agent-1/credential/claude-oauth",
    "http://gw.test/agents/agent-1/credential/forget",
    "http://gw.test/agents/agent-1/credential/api-key",
    "http://gw.test/agents/agent-1/provider/openai-compatible",
  ]);
  for (const url of urls) {
    expect(url).not.toContain("?");
    expect(url).not.toContain("scope");
  }
});

test("the per-agent runtime client's auth routes carry no scope either", async () => {
  // The auth routes used to be wrapped in a fetch that appended
  // `?scope=personal` to anything containing `/auth/`. The wrapper is gone, so
  // these read exactly as they did before the feature: the login's OWN
  // `deviceAuth` query and nothing beside it, and no query at all otherwise.
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
  // A slash-bearing agent id must stay inside its own path segment; nothing is
  // appended after it, so there is no suffix for it to swallow.
  const urls = capture();
  await forgetCredential(cfg, "Houston/Bo", "anthropic");
  expect(urls).toEqual([
    "http://gw.test/agents/Houston%2FBo/credential/forget",
  ]);
});
