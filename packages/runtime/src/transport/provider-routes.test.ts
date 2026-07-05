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

test("GET /providers hydrates served credentials before listing providers", async () => {
  const prevDataDir = process.env.HOUSTON_DATA_DIR;
  const prevControlPlaneUrl = process.env.HOUSTON_CONTROL_PLANE_URL;
  const prevSandboxToken = process.env.HOUSTON_SANDBOX_TOKEN;
  const prevFetch = globalThis.fetch;
  const dataDir = mkdtempSync(join(tmpdir(), "houston-provider-route-"));

  process.env.HOUSTON_DATA_DIR = dataDir;
  process.env.HOUSTON_CONTROL_PLANE_URL = "http://control-plane.test";
  process.env.HOUSTON_SANDBOX_TOKEN = "sbx-token";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("provider=openai-codex")) {
      return new Response(
        JSON.stringify({
          provider: "openai-codex",
          kind: "oauth",
          access: "AT-served",
          expires: 1_730_000_000_000,
          accountId: null,
          enterpriseUrl: null,
        }),
        { status: 200 },
      );
    }
    return new Response(null, { status: 404 });
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
      expires: 1_730_000_000_000,
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
