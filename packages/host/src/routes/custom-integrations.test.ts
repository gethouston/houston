import { createServer, type Server } from "node:http";
import { expect, test, vi } from "vitest";
import { EnvCredentialVault } from "../credentials/vault";
import type { CustomIntegrationManager } from "../integrations/custom/manager";
import {
  CustomIntegrationError,
  type CustomIntegrationView,
} from "../integrations/custom/types";
import {
  type CustomIntegrationDeps,
  handleCustomIntegrations,
  handleSandboxCustomIntegrations,
} from "./custom-integrations";
import { json } from "./http";

/**
 * The custom-integration routes (HOU-550) driven over real HTTP, the same way
 * the other routes/*.test.ts files drive their handlers. These routes only
 * need the MANAGER's method surface (list/detect/add/setCredential/remove), so
 * a hand-rolled `vi.fn()` fake stands in for a real CustomIntegrationManager —
 * there is no need to spin up the real executor engine here (manager.test.ts
 * already covers that).
 */

const VIEW: CustomIntegrationView = {
  slug: "acme",
  name: "Acme",
  kind: "openapi",
  addedAtMs: 1,
  state: { status: "active", toolCount: 1 },
};

function fakeManager(
  overrides: Partial<{
    list: CustomIntegrationManager["list"];
    detect: CustomIntegrationManager["detect"];
    add: CustomIntegrationManager["add"];
    setCredential: CustomIntegrationManager["setCredential"];
    remove: CustomIntegrationManager["remove"];
  }> = {},
): CustomIntegrationManager {
  return {
    list: vi.fn(async () => [VIEW]),
    detect: vi.fn(async () => ({ kind: "unknown" }) as const),
    add: vi.fn(async () => VIEW),
    setCredential: vi.fn(async () => VIEW),
    remove: vi.fn(async () => {}),
    ...overrides,
  } as unknown as CustomIntegrationManager;
}

type Deps = CustomIntegrationDeps & { vault: EnvCredentialVault };

async function startServer(
  deps: Deps,
): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://test.local");
    const method = req.method || "GET";
    const path = url.pathname;
    (async () => {
      if (await handleCustomIntegrations(deps, method, path, req, res)) return;
      if (
        await handleSandboxCustomIntegrations(deps, method, path, url, req, res)
      )
        return;
      json(res, 404, { error: "not found" });
    })().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) json(res, 500, { error: message });
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return { server, base };
}

const vault = new EnvCredentialVault({ secret: "test-secret" });

// ── USER routes ──────────────────────────────────────────────────────────

test("GET definitions returns manager.list(); 404 when no manager is wired", async () => {
  const manager = fakeManager();
  const { server, base } = await startServer({
    customIntegrations: manager,
    vault,
  });
  try {
    const res = await fetch(`${base}/v1/integrations/custom/definitions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [VIEW] });
    expect(manager.list).toHaveBeenCalledOnce();
  } finally {
    server.close();
  }

  const { server: bare, base: bareBase } = await startServer({ vault });
  try {
    const res = await fetch(`${bareBase}/v1/integrations/custom/definitions`);
    expect(res.status).toBe(404);
  } finally {
    bare.close();
  }
});

test("DELETE removes by the DECODED slug; not_found maps to 404 with {error, code}", async () => {
  const remove = vi.fn(async () => {});
  const manager = fakeManager({ remove });
  const { server, base } = await startServer({
    customIntegrations: manager,
    vault,
  });
  try {
    const res = await fetch(
      `${base}/v1/integrations/custom/definitions/my%20slug`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith("my slug");
  } finally {
    server.close();
  }

  const failing = fakeManager({
    remove: vi.fn(async () => {
      throw new CustomIntegrationError(
        "not_found",
        "no custom integration 'x'",
      );
    }),
  });
  const { server: s2, base: b2 } = await startServer({
    customIntegrations: failing,
    vault,
  });
  try {
    const res = await fetch(`${b2}/v1/integrations/custom/definitions/x`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "no custom integration 'x'",
      code: "not_found",
    });
  } finally {
    s2.close();
  }
});

test("POST .../credential validates the body shape (400) before relaying manager.setCredential", async () => {
  const setCredential = vi.fn(async () => VIEW);
  const manager = fakeManager({ setCredential });
  const { server, base } = await startServer({
    customIntegrations: manager,
    vault,
  });
  try {
    const post = (body: unknown) =>
      fetch(`${base}/v1/integrations/custom/definitions/acme/credential`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    expect((await post({})).status).toBe(400); // missing 'values'
    expect((await post({ values: "nope" })).status).toBe(400); // not an object
    expect((await post({ values: [1, 2] })).status).toBe(400); // an array
    expect((await post({ values: { token: 1 } })).status).toBe(400); // non-string value
    expect(setCredential).not.toHaveBeenCalled();

    const ok = await post({ values: { token: "secret" } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(VIEW);
    expect(setCredential).toHaveBeenCalledWith("acme", { token: "secret" });
  } finally {
    server.close();
  }
});

test("POST .../credential relays credential_invalid as 400 + code", async () => {
  const manager = fakeManager({
    setCredential: vi.fn(async () => {
      throw new CustomIntegrationError(
        "credential_invalid",
        "the credential value is empty",
      );
    }),
  });
  const { server, base } = await startServer({
    customIntegrations: manager,
    vault,
  });
  try {
    const res = await fetch(
      `${base}/v1/integrations/custom/definitions/acme/credential`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { token: "" } }),
      },
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "the credential value is empty",
      code: "credential_invalid",
    });
  } finally {
    server.close();
  }
});

// ── SANDBOX routes ───────────────────────────────────────────────────────

test("sandbox detect: 401 with no bearer; 503 integrations_not_configured with no manager; else manager.detect() is called", async () => {
  const { server: noManagerServer, base: noManagerBase } = await startServer({
    vault,
  });
  try {
    const noAuth = await fetch(
      `${noManagerBase}/sandbox/integrations/custom/detect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://x.example.com" }),
      },
    );
    expect(noAuth.status).toBe(401);

    const sb = vault.sandboxToken("W1", "W1/Assistant");
    const noManager = await fetch(
      `${noManagerBase}/sandbox/integrations/custom/detect`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://x.example.com" }),
      },
    );
    expect(noManager.status).toBe(503);
    expect(await noManager.json()).toEqual({
      error: "custom integrations not configured",
      code: "integrations_not_configured",
    });
  } finally {
    noManagerServer.close();
  }

  const detect = vi.fn(async () => ({ kind: "openapi" as const, name: "X" }));
  const manager = fakeManager({ detect });
  const { server, base } = await startServer({
    customIntegrations: manager,
    vault,
  });
  try {
    const sb = vault.sandboxToken("W1", "W1/Assistant");
    const res = await fetch(`${base}/sandbox/integrations/custom/detect`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://x.example.com" }),
    });
    expect(res.status).toBe(200);
    expect(detect).toHaveBeenCalledWith("https://x.example.com");

    const missingUrl = await fetch(
      `${base}/sandbox/integrations/custom/detect`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sb}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
    );
    expect(missingUrl.status).toBe(400);
  } finally {
    server.close();
  }
});

test("sandbox add: kind 'openapi' with no url is 400; unknown kind is 400; a valid mcp add reaches manager.add with the right input shape", async () => {
  const add = vi.fn(async (input: unknown) => ({
    ...VIEW,
    // reflect kind back so the assertion can see what the route parsed
    kind: (input as { kind: "openapi" | "mcp" }).kind,
  }));
  const manager = fakeManager({ add: add as CustomIntegrationManager["add"] });
  const { server, base } = await startServer({
    customIntegrations: manager,
    vault,
  });
  const sb = vault.sandboxToken("W1", "W1/Assistant");
  const post = (body: unknown) =>
    fetch(`${base}/sandbox/integrations/custom/add`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sb}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  try {
    const noUrl = await post({ kind: "openapi", name: "X" });
    expect(noUrl.status).toBe(400);

    const unknownKind = await post({ kind: "csv", name: "X" });
    expect(unknownKind.status).toBe(400);

    const ok = await post({
      kind: "mcp",
      name: "MCP Server",
      endpoint: "https://mcp.example.com",
      auth: "none",
    });
    expect(ok.status).toBe(200);
    expect(add).toHaveBeenCalledWith({
      kind: "mcp",
      name: "MCP Server",
      endpoint: "https://mcp.example.com",
      auth: "none",
    });
  } finally {
    server.close();
  }
});
