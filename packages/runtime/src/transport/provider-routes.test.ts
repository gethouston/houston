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

/** A POST req whose async iteration yields one JSON body chunk (readJson's shape). */
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

    // Fresh agent: nothing saved, nothing connected → the first connect claims,
    // so the first chat runs without a manual model pick (#483).
    let out = await claim("google");
    expect(out.status).toBe(200);
    expect((out.body as { activeProvider?: string }).activeProvider).toBe(
      "google",
    );

    // A later connect must NOT move the saved pick — pasting an OpenCode key
    // while the agent chats on another provider used to flip every open chat
    // onto OpenCode (and its quota errors). The claim is a no-op.
    out = await claim("opencode");
    expect(out.status).toBe(200);
    expect((out.body as { activeProvider?: string }).activeProvider).toBe(
      "google",
    );

    // Junk provider ids fail loudly, exactly like PUT /settings.
    out = await claim("gemini-cli");
    expect(out.status).toBe(400);
    expect((out.body as { error?: string }).error).toMatch(/unknown provider/);
  } finally {
    restoreEnv("HOUSTON_DATA_DIR", prevDataDir);
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
