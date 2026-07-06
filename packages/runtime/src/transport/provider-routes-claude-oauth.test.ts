import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The route warms the connected signal via refreshAnthropicCredential (a real
// `claude auth status` subprocess). Stub ONLY that export so the test is hermetic
// and can assert the route actually calls it — the warming logic itself is
// covered by credential-status.test.ts. The rest of the module (used by
// auth/storage.ts) stays real.
const { refreshSpy } = vi.hoisted(() => ({
  refreshSpy: vi.fn(async () => true),
}));
vi.mock("../backends/claude/credential-status", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../backends/claude/credential-status")
  >()),
  refreshAnthropicCredential: refreshSpy,
}));

import {
  claudeCredentialsFile,
  claudeLoginConfigDir,
} from "../backends/claude/paths";
import { handleProviderRoute } from "./provider-routes";

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

let prevHome: string | undefined;

beforeEach(() => {
  prevHome = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = mkdtempSync(join(tmpdir(), "claude-route-"));
  refreshSpy.mockClear();
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.HOUSTON_HOME;
  else process.env.HOUSTON_HOME = prevHome;
});

test("materializes .credentials.json under the login config dir and warms the signal", async () => {
  const { handled, out } = await post(VALID);
  expect(handled).toBe(true);
  expect(out.status).toBe(200);
  expect(out.body).toEqual({ ok: true });

  const path = claudeCredentialsFile(claudeLoginConfigDir());
  expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(VALID);
  // The connected signal is warmed exactly once on success.
  expect(refreshSpy).toHaveBeenCalledTimes(1);
});

test("malformed body → 400, nothing written, signal not warmed", async () => {
  const { out } = await post({ nope: true });
  expect(out.status).toBe(400);
  expect(existsSync(claudeCredentialsFile(claudeLoginConfigDir()))).toBe(false);
  expect(refreshSpy).not.toHaveBeenCalled();
});

test("invalid JSON → 400", async () => {
  const { out } = await post("{not json");
  expect(out.status).toBe(400);
});
