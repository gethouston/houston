import type { ServerResponse } from "node:http";
import { expect, test } from "vitest";
import { handleMcpOAuthCallback } from "../../routes/integrations-mcp-callback";
import { MemoryMcpAuthStore } from "./auth-store";
import { HubCatalogSource } from "./hub-catalog-source";
import { McpIntegrationProvider } from "./provider";

async function callback(
  provider: McpIntegrationProvider,
  now: number,
  query: string,
) {
  let status = 0;
  let body = "";
  const response = {
    writeHead(next: number) {
      status = next;
      return this;
    },
    end(value?: string) {
      body = value ?? "";
      return this;
    },
  } as unknown as ServerResponse;
  const url = new URL(
    `/v1/integrations/mcp/callback?${query}`,
    "http://localhost",
  );
  await handleMcpOAuthCallback(
    { providers: [provider], now: () => now },
    "GET",
    url.pathname,
    url,
    response,
  );
  return { status, body };
}

function provider(store: MemoryMcpAuthStore) {
  return new McpIntegrationProvider({
    catalog: new HubCatalogSource({ cachePath: "/dev/null", url: "" }),
    id: "composio-apps",
    url: "https://connect.composio.dev/mcp",
    redirectUrl: "http://localhost/callback",
    store,
    exchangeAuthorization: async (oauth, _url, code) => {
      await oauth.saveTokens({
        access_token: `token-${code}`,
        token_type: "bearer",
      });
    },
  });
}

test("rejects unknown state", async () => {
  const response = await callback(
    provider(new MemoryMcpAuthStore()),
    1_000,
    "code=x&state=bad",
  );
  expect(response.status).toBe(400);
});

test("rejects and consumes expired state", async () => {
  const store = new MemoryMcpAuthStore({
    "composio-apps": { pending: { state: "old", startedAtMs: 1_000 } },
  });
  const response = await callback(
    provider(store),
    1_000 + 10 * 60_000 + 1,
    "code=x&state=old",
  );
  expect(response.status).toBe(400);
  expect((await store.read("composio-apps")).pending).toBeUndefined();
});

test("exchanges a valid code, persists tokens, and clears pending state", async () => {
  const store = new MemoryMcpAuthStore({
    "composio-apps": { pending: { state: "fresh", startedAtMs: 1_000 } },
  });
  const response = await callback(
    provider(store),
    2_000,
    "code=ok&state=fresh",
  );
  expect(response.status).toBe(200);
  expect(response.body).toContain("Connected. You can close this tab");
  expect(await store.read("composio-apps")).toEqual({
    tokens: { access_token: "token-ok", token_type: "bearer" },
  });

  const reused = await callback(
    provider(store),
    2_000,
    "code=again&state=fresh",
  );
  expect(reused.status).toBe(400);
});
