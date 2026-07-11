import { describe, expect, it, vi } from "vitest";
import { IntegrationsClient } from "./client-integrations";

const BASE = "http://127.0.0.1:4317";

interface Recorded {
  method: string;
  path: string;
  body?: unknown;
}

/** An {@link IntegrationsClient} over a mock `fetch` recording every call. */
function makeClient() {
  const calls: Recorded[] = [];
  const fetchImpl = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = new URL(String(input));
      calls.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        body:
          init?.body === undefined ? undefined : JSON.parse(String(init.body)),
      });
      return new Response(
        JSON.stringify({ redirectUrl: "u", connectionId: "c1" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    },
  );
  const client = new IntegrationsClient({
    baseUrl: BASE,
    fetch: fetchImpl as unknown as typeof fetch,
  });
  return { client, calls };
}

const I = "/v1/integrations";

describe("IntegrationsClient — additive connect/disconnect options", () => {
  it("connect(toolkit) keeps the legacy composio route + { toolkit } body", async () => {
    const { client, calls } = makeClient();
    await client.connect("gmail");
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/composio/connect`,
        body: { toolkit: "gmail" },
      },
    ]);
  });

  it("connect(toolkit, { provider, agent }) routes to the provider and adds agent", async () => {
    const { client, calls } = makeClient();
    await client.connect("gmail", { provider: "composio", agent: "ag_1" });
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/composio/connect`,
        body: { toolkit: "gmail", agent: "ag_1" },
      },
    ]);
  });

  it("disconnect(toolkit) keeps the legacy composio { toolkit } body", async () => {
    const { client, calls } = makeClient();
    await client.disconnect("gmail");
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/composio/disconnect`,
        body: { toolkit: "gmail" },
      },
    ]);
  });
});

describe("IntegrationsClient — session + reconnect notice", () => {
  it("setSession PUTs { token }", async () => {
    const { client, calls } = makeClient();
    await client.setSession("jwt-1");
    expect(calls).toEqual([
      { method: "PUT", path: `${I}/session`, body: { token: "jwt-1" } },
    ]);
  });

  it("setSession(null) PUTs { token: null }", async () => {
    const { client, calls } = makeClient();
    await client.setSession(null);
    expect(calls).toEqual([
      { method: "PUT", path: `${I}/session`, body: { token: null } },
    ]);
  });

  it("dismissReconnectNotice POSTs the dismiss route", async () => {
    const { client, calls } = makeClient();
    await client.dismissReconnectNotice();
    expect(calls).toEqual([
      {
        method: "POST",
        path: `${I}/reconnect-notice/dismiss`,
        body: undefined,
      },
    ]);
  });
});
