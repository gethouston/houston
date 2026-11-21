import { mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function mockRes(): {
  res: ServerResponse;
  out: { status?: number; body?: unknown };
} {
  const out: { status?: number; body?: unknown } = {};
  const res = {
    writeHead(status: number) {
      out.status = status;
    },
    end(buf: Buffer | string) {
      out.body = JSON.parse(buf.toString());
    },
  } as unknown as ServerResponse;
  return { res, out };
}

function mockPostReq(body: unknown): IncomingMessage {
  return {
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body));
    },
  } as unknown as IncomingMessage;
}

test("POST /settings/claim claims a fresh agent but never moves a saved provider (HOU-695)", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-claim-route-"));
  process.env.HOUSTON_DATA_DIR = dataDir;

  try {
    vi.resetModules();
    const { handleProviderRoute } = await import("./provider-routes");
    const claim = async (provider: string) => {
      const { res, out } = mockRes();
      expect(
        await handleProviderRoute({
          method: "POST",
          path: "/settings/claim",
          url: new URL("http://runtime.test/settings/claim"),
          req: mockPostReq({ provider }),
          res,
        }),
      ).toBe(true);
      return out;
    };

    let out = await claim("google");
    expect(out.status).toBe(200);
    expect((out.body as { activeProvider?: string }).activeProvider).toBe(
      "google",
    );

    out = await claim("opencode");
    expect(out.status).toBe(200);
    expect((out.body as { activeProvider?: string }).activeProvider).toBe(
      "google",
    );

    out = await claim("gemini-cli");
    expect(out.status).toBe(400);
    expect((out.body as { error?: string }).error).toMatch(/unknown provider/);
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    vi.resetModules();
  }
});

test("GET /providers/usage answers one row per connected provider", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const prevHome = process.env.HOUSTON_HOME;
  const prevFetch = globalThis.fetch;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-usage-route-"));
  process.env.HOUSTON_DATA_DIR = dataDir;
  process.env.HOUSTON_HOME = dataDir;
  globalThis.fetch = (async () => {
    throw new Error("network must not be touched with nothing connected");
  }) as typeof fetch;

  try {
    vi.resetModules();
    const { handleProviderRoute } = await import("./provider-routes");
    const { res, out } = mockRes();

    expect(
      await handleProviderRoute({
        method: "GET",
        path: "/providers/usage",
        url: new URL("http://runtime.test/providers/usage"),
        req: { headers: {} } as IncomingMessage,
        res,
      }),
    ).toBe(true);

    expect(out.status).toBe(200);
    expect(Array.isArray(out.body)).toBe(true);
  } finally {
    globalThis.fetch = prevFetch;
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    restoreEnv("HOUSTON_HOME", prevHome);
    vi.resetModules();
  }
});

test("GET /providers hydrates served credentials before listing providers", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const prevControlPlaneUrl = process.env.HOUSTON_CONTROL_PLANE_URL;
  const prevSandboxToken = process.env.HOUSTON_SANDBOX_TOKEN;
  const prevFetch = globalThis.fetch;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-provider-route-"));

  process.env.HOUSTON_DATA_DIR = dataDir;
  process.env.HOUSTON_CONTROL_PLANE_URL = "http://control-plane.test";
  process.env.HOUSTON_SANDBOX_TOKEN = "sbx-token";
  const servedExpires = Date.now() + 3_600_000;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("provider=openai-codex")) {
      return new Response(
        JSON.stringify({
          provider: "openai-codex",
          kind: "oauth",
          access: "AT-served",
          expires: servedExpires,
          accountId: null,
          enterpriseUrl: null,
        }),
        { status: 200 },
      );
    }
    return new Response(null, {
      status: 404,
      headers: { "x-houston-not-connected": "1" },
    });
  }) as typeof fetch;

  try {
    vi.resetModules();
    const { handleProviderRoute } = await import("./provider-routes");
    const { readAuthFile } = await import("../auth/auth-file");
    const { res, out } = mockRes();

    expect(
      await handleProviderRoute({
        method: "GET",
        path: "/providers",
        url: new URL("http://runtime.test/providers"),
        req: { headers: {} } as IncomingMessage,
        res,
      }),
    ).toBe(true);

    expect(out.status).toBe(200);
    expect(readAuthFile(join(dataDir, "auth.json"))["openai-codex"]).toEqual({
      type: "oauth",
      access: "AT-served",
      refresh: "",
      expires: servedExpires,
    });
    expect(
      (
        out.body as {
          id: string;
          configured: boolean;
        }[]
      ).find((p) => p.id === "openai-codex")?.configured,
    ).toBe(true);
  } finally {
    globalThis.fetch = prevFetch;
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    restoreEnv("HOUSTON_CONTROL_PLANE_URL", prevControlPlaneUrl);
    restoreEnv("HOUSTON_SANDBOX_TOKEN", prevSandboxToken);
    vi.resetModules();
  }
});

test("POST /auth/azure-openai-responses/api-key requires the endpoint and persists both (PRODUCT-1477)", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-azure-route-"));
  process.env.HOUSTON_DATA_DIR = dataDir;

  vi.doMock("../auth/verify-api-key", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    verifyApiKey: vi.fn().mockResolvedValue(undefined),
  }));
  try {
    vi.resetModules();
    const { handleProviderRoute } = await import("./provider-routes");
    const { verifyApiKey } = await import("../auth/verify-api-key");
    const { azureBaseUrl } = await import("../ai/azure-openai");
    const { authStorage } = await import("../auth/storage");

    const connect = async (body: unknown) => {
      const { res, out } = mockRes();
      expect(
        await handleProviderRoute({
          method: "POST",
          path: "/auth/azure-openai-responses/api-key",
          url: new URL(
            "http://runtime.test/auth/azure-openai-responses/api-key",
          ),
          req: mockPostReq(body),
          res,
        }),
      ).toBe(true);
      return out;
    };

    let out = await connect({ key: "azure-key" });
    expect(out.status).toBe(400);
    out = await connect({
      key: "azure-key",
      endpoint: "http://acme.openai.azure.com",
    });
    expect(out.status).toBe(400);
    expect(verifyApiKey).not.toHaveBeenCalled();
    expect(authStorage.get("azure-openai-responses")).toBeUndefined();
    expect(azureBaseUrl()).toBe("");

    out = await connect({
      key: "azure-key",
      endpoint: "https://acme.openai.azure.com/",
    });
    expect(out.status).toBe(200);
    expect(verifyApiKey).toHaveBeenCalledWith(
      "azure-openai-responses",
      "azure-key",
      { azureBaseUrl: "https://acme.openai.azure.com" },
    );
    expect(authStorage.get("azure-openai-responses")).toEqual({
      type: "api_key",
      key: "azure-key",
    });
    expect(azureBaseUrl()).toBe("https://acme.openai.azure.com");

    const { res, out: orOut } = mockRes();
    await handleProviderRoute({
      method: "POST",
      path: "/auth/openrouter/api-key",
      url: new URL("http://runtime.test/auth/openrouter/api-key"),
      req: mockPostReq({ key: "sk-or-abc" }),
      res,
    });
    expect(orOut.status).toBe(200);
    expect(verifyApiKey).toHaveBeenCalledWith(
      "openrouter",
      "sk-or-abc",
      undefined,
    );
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    vi.doUnmock("../auth/verify-api-key");
    vi.resetModules();
  }
});

test("POST /auth/azure-openai-responses/api-key persists NOTHING when the probe rejects (PRODUCT-1477)", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-azure-reject-"));
  process.env.HOUSTON_DATA_DIR = dataDir;

  vi.doMock("../auth/verify-api-key", async (importOriginal) => {
    const real =
      await importOriginal<typeof import("../auth/verify-api-key")>();
    return {
      ...real,
      verifyApiKey: vi
        .fn()
        .mockRejectedValue(
          new real.ApiKeyVerifyError("azure said no", "invalid_key"),
        ),
    };
  });
  try {
    vi.resetModules();
    const { handleProviderRoute } = await import("./provider-routes");
    const { azureBaseUrl } = await import("../ai/azure-openai");
    const { authStorage } = await import("../auth/storage");

    const { res, out } = mockRes();
    await handleProviderRoute({
      method: "POST",
      path: "/auth/azure-openai-responses/api-key",
      url: new URL("http://runtime.test/auth/azure-openai-responses/api-key"),
      req: mockPostReq({
        key: "bad-key",
        endpoint: "https://acme.openai.azure.com",
      }),
      res,
    });
    expect(out.status).toBe(401);
    expect((out.body as { reason?: string }).reason).toBe("invalid_key");
    expect(authStorage.get("azure-openai-responses")).toBeUndefined();
    expect(azureBaseUrl()).toBe("");
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    vi.doUnmock("../auth/verify-api-key");
    vi.resetModules();
  }
});

test("DELETE /auth/:provider/api-key rolls back only the exact just-connected key (PRODUCT-1321)", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-rollback-route-"));
  process.env.HOUSTON_DATA_DIR = dataDir;

  try {
    vi.resetModules();
    const { handleProviderRoute } = await import("./provider-routes");
    const { authStorage } = await import("../auth/storage");
    const { readAuthFile } = await import("../auth/auth-file");
    authStorage.set("openrouter", { type: "api_key", key: "sk-or-KEEP" });

    const del = async (body: unknown) => {
      const { res, out } = mockRes();
      expect(
        await handleProviderRoute({
          method: "DELETE",
          path: "/auth/openrouter/api-key",
          url: new URL("http://runtime.test/auth/openrouter/api-key"),
          req: mockPostReq(body),
          res,
        }),
      ).toBe(true);
      return out;
    };

    let out = await del({ key: "sk-or-OTHER" });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, removed: false });
    expect(readAuthFile(join(dataDir, "auth.json")).openrouter).toEqual({
      type: "api_key",
      key: "sk-or-KEEP",
    });

    out = await del({});
    expect(out.status).toBe(400);

    out = await del({ key: "sk-or-KEEP" });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ ok: true, removed: true });
    expect(readAuthFile(join(dataDir, "auth.json")).openrouter).toBeUndefined();
    expect(authStorage.get("openrouter")).toBeUndefined();

    out = await del({ key: "sk-or-KEEP" });
    expect(out.body).toEqual({ ok: true, removed: false });
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    vi.resetModules();
  }
});

test("openai-compatible route round-trips the org marker without returning its key", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-shared-route-"));
  process.env.HOUSTON_DATA_DIR = dataDir;

  try {
    vi.resetModules();
    const { handleProviderRoute } = await import("./provider-routes");
    const request = async (method: string, path: string, body?: unknown) => {
      const { res, out } = mockRes();
      await handleProviderRoute({
        method,
        path,
        url: new URL(`http://runtime.test${path}`),
        req:
          body === undefined
            ? ({ headers: {} } as IncomingMessage)
            : mockPostReq(body),
        res,
      });
      return out;
    };

    expect(
      (
        await request("POST", "/providers/openai-compatible", {
          baseUrl: "https://relay.example.com/v1",
          model: "qwen",
          apiKey: "never-return-this",
          orgShared: true,
        })
      ).status,
    ).toBe(200);
    const configured = await request("GET", "/providers/openai-compatible");
    expect(configured.body).toEqual({
      configured: true,
      orgShared: true,
      endpoint: {
        baseUrl: "https://relay.example.com/v1",
        model: "qwen",
      },
    });
    expect(JSON.stringify(configured.body)).not.toContain("never-return-this");

    expect(
      (await request("POST", "/auth/openai-compatible/logout")).status,
    ).toBe(200);
    expect((await request("GET", "/providers/openai-compatible")).body).toEqual(
      { configured: false, orgShared: false },
    );
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
    vi.resetModules();
  }
});
