import { describe, expect, it, vi } from "vitest";
import { HoustonEngineClient } from "./client";

/**
 * The credential routes {@link EngineCredentialClient} contributes to
 * {@link HoustonEngineClient}. They are asserted THROUGH the concrete client,
 * because that is the only way anything calls them: the split is a file
 * boundary, never a surface a caller reaches on its own.
 *
 * Each case pins the exact outgoing {method, url, body} — several of these
 * routes differ only by their last path segment (`login` / `login/cancel` /
 * `login/complete` / `logout`), so a mistyped literal would quietly perform a
 * different action against the user's saved credentials.
 */

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  url: string;
  body?: unknown;
}

function makeClient() {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  const client = new HoustonEngineClient({
    baseUrl: BASE,
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls };
}

describe("the engine client's credential routes", () => {
  it("reads the auth status off the runtime", async () => {
    const { client, calls } = makeClient();
    await client.authStatus();
    expect(calls).toEqual([{ method: "GET", url: `${BASE}/auth/status` }]);
  });

  it("starts a device-code login with no query by default", async () => {
    const { client, calls } = makeClient();
    await client.startLogin("openai-codex");
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${BASE}/auth/openai-codex/login`,
    });
  });

  it("asks for the loopback login and an enterprise GitHub by query", async () => {
    const { client, calls } = makeClient();
    await client.startLogin("github-copilot", false, "acme.ghe.com");
    expect(calls[0].url).toBe(
      `${BASE}/auth/github-copilot/login?deviceAuth=false&enterpriseDomain=acme.ghe.com`,
    );
  });

  it("escapes an arbitrary provider id instead of splicing the path", async () => {
    // `ProviderId` widens to `(string & {})`, so the id is NOT a closed set of
    // slugs: an unescaped `a/b` would POST to `/auth/a/b/login/cancel`, which is
    // a different route from the one the caller asked for.
    const { client, calls } = makeClient();
    await client.cancelLogin("a/b?x");
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${BASE}/auth/a%2Fb%3Fx/login/cancel`,
    });
  });

  it("submits a pasted login code to the completion route", async () => {
    const { client, calls } = makeClient();
    await client.completeLogin("anthropic", "code-1");
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${BASE}/auth/anthropic/login/complete`,
      body: { code: "code-1" },
    });
  });

  it("stores an api key, carrying an endpoint only when one is given", async () => {
    const { client, calls } = makeClient();
    await client.setApiKey("deepseek", "sk-1");
    await client.setApiKey("azure", "sk-2", "https://acme.openai.azure.com");
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST ${BASE}/auth/deepseek/api-key`,
      `POST ${BASE}/auth/azure/api-key`,
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      { key: "sk-1" },
      { key: "sk-2", endpoint: "https://acme.openai.azure.com" },
    ]);
  });

  it("registers an OpenAI-compatible server verbatim", async () => {
    const { client, calls } = makeClient();
    await client.setCustomEndpoint({
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "qwen3",
    });
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${BASE}/providers/openai-compatible`,
      body: { baseUrl: "http://127.0.0.1:11434/v1", model: "qwen3" },
    });
  });

  it("forgets a credential through the provider's logout route", async () => {
    const { client, calls } = makeClient();
    await client.logout("anthropic");
    expect(calls[0]).toEqual({
      method: "POST",
      url: `${BASE}/auth/anthropic/logout`,
    });
  });
});
