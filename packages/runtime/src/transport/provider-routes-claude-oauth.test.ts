import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterAll, afterEach, beforeEach, expect, test, vi } from "vitest";

const { refreshSpy } = vi.hoisted(() => ({
  refreshSpy: vi.fn(async () => true),
}));
vi.mock("../backends/claude/credential-status", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../backends/claude/credential-status")
  >()),
  refreshAnthropicCredential: refreshSpy,
}));

const prevDataDir = process.env.HOUSTON_DATA_DIR;
process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "claude-route-data-"),
);

const { claudeCredentialsFile, claudeLoginConfigDir } = await import(
  "../backends/claude/paths"
);
const { config } = await import("../config");
const { handleProviderRoute } = await import("./provider-routes");
const { authStorage } = await import("../auth/storage");
const { readAnthropicToken } = await import("../backends/claude/read-token");
const { buildClaudeEnv } = await import("../backends/claude/claude-env");
const { isAccessOnlyOAuth } = await import("../auth/empty-refresh-guard");

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
      out.body = buf ? JSON.parse(buf.toString()) : undefined;
    },
  } as unknown as ServerResponse;
  return { res, out };
}

function reqWith(body: string): IncomingMessage {
  return Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
}

async function post(body: unknown) {
  const { res, out } = mockRes();
  const handled = await handleProviderRoute({
    method: "POST",
    path: "/auth/anthropic/oauth-credential",
    url: new URL("http://runtime.test/auth/anthropic/oauth-credential"),
    req: reqWith(typeof body === "string" ? body : JSON.stringify(body)),
    res,
  });
  return { handled, out };
}

const VALID = {
  claudeAiOauth: {
    accessToken: "sk-ant-oat-access",
    refreshToken: "sk-ant-ort-refresh",
    expiresAt: 1_800_000_000_000,
    scopes: ["user:inference"],
    subscriptionType: "max",
  },
};

const VALID_OAT = {
  claudeAiOauth: {
    accessToken: "sk-ant-oat01-access",
    refreshToken: "sk-ant-ort-refresh",
    expiresAt: 1_800_000_000_000,
    scopes: ["user:inference"],
    subscriptionType: "max",
  },
};

let prevHome: string | undefined;
let previousControlPlaneUrl: string;
let previousSandboxToken: string;

beforeEach(() => {
  prevHome = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = mkdtempSync(join(tmpdir(), "claude-route-"));
  previousControlPlaneUrl = config.controlPlaneUrl;
  previousSandboxToken = config.sandboxToken;
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
  refreshSpy.mockClear();
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.HOUSTON_HOME;
  else process.env.HOUSTON_HOME = prevHome;
  config.controlPlaneUrl = previousControlPlaneUrl;
  config.sandboxToken = previousSandboxToken;
  authStorage.remove("anthropic");
});

test("outside serve mode materializes the full credential and warms the signal", async () => {
  const { handled, out } = await post(VALID);
  expect(handled).toBe(true);
  expect(out.status).toBe(200);
  expect(out.body).toEqual({ ok: true });

  const path = claudeCredentialsFile(claudeLoginConfigDir());
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(VALID);
  expect(refreshSpy).toHaveBeenCalledTimes(1);
});

test("outside serve mode also persists a usable oauth token to the auth store", async () => {
  const { out } = await post(VALID_OAT);
  expect(out.status).toBe(200);

  const token = readAnthropicToken(authStorage);
  expect(token).toMatchObject({
    kind: "oauth-token",
    value: "sk-ant-oat01-access",
  });
  expect(buildClaudeEnv(token, { configDir: "/tmp/cfg" })).toMatchObject({
    CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-access",
  });
  expect(authStorage.get("anthropic")).toMatchObject({
    type: "oauth",
    access: "sk-ant-oat01-access",
    refresh: "sk-ant-ort-refresh",
    expires: 1_800_000_000_000,
  });
});

test("in serve mode materializes an access-only credential", async () => {
  config.controlPlaneUrl = "https://control.test";
  config.sandboxToken = "sandbox-token";

  const { out } = await post(VALID);

  expect(out.status).toBe(200);
  expect(
    JSON.parse(
      readFileSync(claudeCredentialsFile(claudeLoginConfigDir()), "utf8"),
    ),
  ).toEqual({
    claudeAiOauth: {
      ...VALID.claudeAiOauth,
      refreshToken: "",
    },
  });
});

test("in serve mode persists an access-only auth-store entry (no competing rotator)", async () => {
  config.controlPlaneUrl = "https://control.test";
  config.sandboxToken = "sandbox-token";

  const { out } = await post(VALID_OAT);
  expect(out.status).toBe(200);

  const stored = authStorage.get("anthropic");
  expect(stored).toMatchObject({
    type: "oauth",
    access: "sk-ant-oat01-access",
    refresh: "",
  });
  expect(isAccessOnlyOAuth(stored)).toBe(true);
  expect(readAnthropicToken(authStorage)).toMatchObject({
    kind: "oauth-token",
    value: "sk-ant-oat01-access",
  });
});

test("malformed body → 400, nothing written, signal not warmed", async () => {
  const { out } = await post({ nope: true });
  expect(out.status).toBe(400);
  expect(existsSync(claudeCredentialsFile(claudeLoginConfigDir()))).toBe(false);
  expect(authStorage.get("anthropic")).toBeUndefined();
  expect(refreshSpy).not.toHaveBeenCalled();
});

test("invalid JSON → 400", async () => {
  const { out } = await post("{not json");
  expect(out.status).toBe(400);
});

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.HOUSTON_DATA_DIR;
  else process.env.HOUSTON_DATA_DIR = prevDataDir;
});
