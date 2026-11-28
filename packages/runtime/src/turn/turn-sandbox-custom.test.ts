import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { AddCustomIntegrationInput } from "@houston/host/src/integrations/custom/manager";
import { FsVfs } from "@houston/host/src/vfs";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { makeCustomIntegrationTools } from "../session/tools/custom-integrations";
import type { TurnCustomContext } from "./turn-custom-context";
import type { TurnFilesystem } from "./turn-filesystem";
import type { TurnSandboxDeps } from "./turn-sandbox";
import { makeTurnCustomRoutes } from "./turn-sandbox-custom";

const CALLBACK = "https://gateway.test/v1/integrations/custom/oauth/callback";

const MCP_ADD = {
  kind: "mcp",
  name: "Example",
  endpoint: "https://mcp.example.test",
  auth: "oauth",
};

async function deps(oauthSupported: boolean): Promise<TurnSandboxDeps> {
  const root = await mkdtemp(join(tmpdir(), "turn-sandbox-custom-"));
  const store: ObjectStore = {
    list: async () => [],
    manifest: async () => [],
    download: async () => undefined,
    upload: async () => ({ generation: "1" }),
    delete: async () => undefined,
  };
  const filesystem = {
    kind: "standing" as const,
    storeRoot: root,
    workspaceRel: "workspaces/Personal/Bob",
    workspaceDir: join(root, "workspaces/Personal/Bob"),
    dataRel: "workspaces/Personal/Bob/.houston/runtime",
    dataDir: join(root, "workspaces/Personal/Bob/.houston/runtime"),
    manifest: new Map(),
    vfs: new FsVfs(root),
    listedObjects: 0,
    skippedObjects: 0,
    startupLoad: { objects: 0, bytes: 0 },
    generationAware: true,
    immediateWrites: new Set(),
  } satisfies TurnFilesystem;
  return {
    store,
    prefix: "",
    filesystem,
    ...(oauthSupported ? { customOAuthCallbackUrl: CALLBACK } : {}),
  } as unknown as TurnSandboxDeps;
}

async function routes(oauthSupported: boolean) {
  const sandbox = await deps(oauthSupported);
  const added: AddCustomIntegrationInput[] = [];
  const context = {
    manager: {
      oauthSupported,
      detect: async () => ({
        kind: "mcp" as const,
        name: "Example",
        requiresAuthentication: true,
        requiresOAuth: true,
        oauthSupported,
      }),
      add: async (input: AddCustomIntegrationInput) => {
        added.push(input);
        await writeFile(
          join(sandbox.filesystem.storeRoot, "custom-integrations.json"),
          JSON.stringify({ version: 1, items: [] }),
        );
        return {
          slug: "example",
          name: "Example",
          auth: "oauth",
          state: { status: "pending" },
        };
      },
    },
  } as unknown as TurnCustomContext;
  const route = makeTurnCustomRoutes(
    sandbox,
    async () => context,
    async () => undefined,
    async () => undefined,
  );
  return { route, added };
}

test("a sign-in server detected where the gateway holds attempts reports sign-in support", async () => {
  const { route } = await routes(true);
  const response = await route("/sandbox/integrations/custom/detect", {
    url: "https://mcp.example.test",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    requiresOAuth: true,
    oauthSupported: true,
  });
});

test("a sign-in server is added pending where the gateway holds attempts", async () => {
  const { route, added } = await routes(true);
  const response = await route("/sandbox/integrations/custom/add", MCP_ADD);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    slug: "example",
    auth: "oauth",
    state: { status: "pending" },
  });
  expect(added).toMatchObject([
    { kind: "mcp", endpoint: "https://mcp.example.test", auth: "oauth" },
  ]);
});

test("without sign-in support, detection sends the person to Integrations", async () => {
  const { route } = await routes(false);
  const response = await route("/sandbox/integrations/custom/detect", {
    url: "https://mcp.example.test",
  });
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.code).toBe("oauth_connect_from_integrations");
  expect(body.error).toMatch(/Add manually, pick MCP server, paste it/);
  expect(body.error).not.toMatch(/awake/i);
});

test("custom add validates its shape before declining OAuth", async () => {
  const { route } = await routes(false);
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

test("without sign-in support, an OAuth add is declined before any write", async () => {
  const { route, added } = await routes(false);
  const response = await route("/sandbox/integrations/custom/add", MCP_ADD);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    code: "oauth_connect_from_integrations",
    error: expect.stringContaining("Do not ask for an API key"),
  });
  expect(added).toEqual([]);
});

test("the model reads the whole decline through the custom-integration tool", async () => {
  const { route } = await routes(false);
  const [detect] = makeCustomIntegrationTools({
    call: async (path, init) =>
      route(path, JSON.parse(String(init?.body ?? "{}"))),
  });
  const failure = await detect
    .execute(
      "t1",
      { url: "https://mcp.example.test" },
      undefined,
      undefined,
      {} as unknown as ExtensionToolContext,
    )
    .then(
      () => null,
      (error: Error) => error.message,
    );
  expect(failure).toContain("oauth_connect_from_integrations");
  expect(failure).toContain("Do not ask for an API key");
  expect(failure).toMatch(/paste it, and sign in\."\}$/);
});
