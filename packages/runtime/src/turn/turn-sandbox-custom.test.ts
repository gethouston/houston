import { expect, test } from "vitest";
import type { TurnCustomContext } from "./turn-custom-context";
import type { TurnSandboxDeps } from "./turn-sandbox";
import { makeTurnCustomRoutes } from "./turn-sandbox-custom";

// SAFETY: these tests exercise only the detect and pre-mutation add branches.
const context = {
  manager: {
    detect: async () => ({
      kind: "mcp" as const,
      name: "Example",
      requiresAuthentication: true,
      requiresOAuth: true,
      oauthSupported: false,
    }),
  },
} as unknown as TurnCustomContext;

const route = makeTurnCustomRoutes(
  // SAFETY: OAuth declines return before any sandbox dependency is read.
  {} as TurnSandboxDeps,
  async () => context,
  async () => undefined,
  () => undefined,
);

test("OAuth detection directs the model to an awake app connection", async () => {
  const response = await route("/sandbox/integrations/custom/detect", {
    url: "https://mcp.example.test",
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "oauth_requires_awake_assistant",
    error: expect.stringMatching(/open this assistant.*keep it awake/i),
  });
});

test("custom add validates its shape before declining OAuth", async () => {
  const response = await route("/sandbox/integrations/custom/add", {
    kind: "openapi",
    name: "Example",
    url: "https://example.test/openapi.json",
    auth: "oauth",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({
    error: "auth 'oauth' is only supported for MCP servers",
  });
});

test("valid MCP OAuth add directs the model to an awake app connection", async () => {
  const response = await route("/sandbox/integrations/custom/add", {
    kind: "mcp",
    name: "Example",
    endpoint: "https://mcp.example.test",
    auth: "oauth",
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    code: "oauth_requires_awake_assistant",
    error: expect.stringContaining("Do not ask for an API key"),
  });
});
