import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderError } from "@houston/protocol";
import { accessDigest } from "@houston/protocol/access-digest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { config } from "../config";
import { runWithActingContext } from "../session/acting-context";
import {
  clearProviderMarks,
  noteAuthFailure,
  noteQuotaExhausted,
  resetAuthFailures,
} from "./credential-health";
import {
  reportRevokedServedToken,
  resetRevokedReportsForTest,
} from "./report-revoked";
import { resetTurnRevokedReportsForTest } from "./report-revoked-turn";
import {
  reportDeadServedApiKey,
  resetDeadKeyReportsForTest,
} from "./served-key-guard";
import type { TurnCredentialChannel } from "./turn-credential-channel";
import { settleTurnCredentialReports } from "./turn-credential-report";
import { newUsedTokenCapture, runWithUsedTokenCapture } from "./used-token";

type Sent = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
};

let sent: Sent[] = [];
let answer: () => Response = () =>
  new Response(JSON.stringify({ ok: true, removed: true, changed: true }));
const prevFetch = globalThis.fetch;
const prevDataDir = config.dataDir;
const prevControlPlane = config.controlPlaneUrl;
const prevSandboxToken = config.sandboxToken;

beforeEach(() => {
  sent = [];
  answer = () =>
    new Response(JSON.stringify({ ok: true, removed: true, changed: true }));
  config.dataDir = mkdtempSync(join(tmpdir(), "houston-turn-report-"));
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    sent.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string>) },
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return answer();
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = prevFetch;
  config.dataDir = prevDataDir;
  config.controlPlaneUrl = prevControlPlane;
  config.sandboxToken = prevSandboxToken;
  resetRevokedReportsForTest();
  resetTurnRevokedReportsForTest();
  resetDeadKeyReportsForTest();
  vi.restoreAllMocks();
  resetAuthFailures();
});

function channel(
  overrides: Partial<TurnCredentialChannel> = {},
): TurnCredentialChannel {
  return {
    baseUrl: "http://gateway.test",
    orgSlug: "0123456789abcdef",
    agentSlug: "fedcba9876543210",
    hostToken: "turn-token",
    actingAs: "acting-token",
    provider: "anthropic",
    kind: "oauth",
    scope: "personal",
    accessSha256: accessDigest("served-access"),
    ...overrides,
  };
}

async function inTurn(
  ch: TurnCredentialChannel,
  fn: () => void,
): Promise<void> {
  runWithActingContext({ credentialChannel: ch }, fn);
  await settleTurnCredentialReports(ch);
}

const credentialUrl =
  "http://gateway.test/v1/pod/credentials/0123456789abcdef/fedcba9876543210/anthropic";

const revoked: ProviderError = {
  kind: "unauthenticated",
  provider: "anthropic",
  cause: "token_revoked",
  message: "401 OAuth access token has been revoked",
};

test("a turn reports a revoked served token through the gateway's compare-and-delete", async () => {
  const ch = channel();
  await inTurn(ch, () =>
    reportRevokedServedToken(revoked, accessDigest("the-failed-token")),
  );
  expect(sent.find((s) => s.method === "POST")?.body).toEqual({
    kind: "needs_reconnect",
    accessSha256: accessDigest("the-failed-token"),
  });
  expect(sent.filter((s) => s.method === "DELETE")).toEqual([
    {
      url: credentialUrl,
      method: "DELETE",
      headers: {
        Authorization: "Bearer turn-token",
        "x-houston-acting-as": "acting-token",
        "x-houston-credential-scope": "personal",
        "x-houston-if-access-sha256": accessDigest("the-failed-token"),
      },
      body: null,
    },
  ]);
});

test("the turn report keeps every pod gate", async () => {
  const ch = channel();
  await inTurn(ch, () => {
    reportRevokedServedToken(
      { ...revoked, cause: "token_expired" },
      accessDigest("t"),
    );
    reportRevokedServedToken(
      { ...revoked, message: "please log in again" },
      accessDigest("t"),
    );
    reportRevokedServedToken(
      { ...revoked, provider: "openai-codex" },
      accessDigest("t"),
    );
    reportRevokedServedToken(revoked, undefined);
  });
  await inTurn(channel({ kind: "api_key" }), () =>
    reportRevokedServedToken(revoked, accessDigest("t")),
  );
  expect(sent.filter((s) => s.method === "DELETE")).toEqual([]);
});

test("one report per token, and a failed one retries on the next failure", async () => {
  answer = () => new Response("gateway down", { status: 503 });
  const ch = channel();
  await inTurn(ch, () => reportRevokedServedToken(revoked, accessDigest("t")));
  answer = () => new Response(JSON.stringify({ ok: true, removed: false }));
  await inTurn(ch, () => {
    reportRevokedServedToken(revoked, accessDigest("t"));
    reportRevokedServedToken(revoked, accessDigest("t"));
  });
  expect(sent.filter((s) => s.method === "DELETE")).toHaveLength(2);
});

test("the turn waits for an in-flight report before it settles", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    await gate;
    return prev(url, init);
  }) as unknown as typeof globalThis.fetch;
  const ch = channel();
  runWithActingContext({ credentialChannel: ch }, () =>
    reportRevokedServedToken(revoked, accessDigest("t")),
  );
  let settled = false;
  const waiting = settleTurnCredentialReports(ch).then(() => {
    settled = true;
  });
  await new Promise((r) => setTimeout(r, 10));
  expect(settled).toBe(false);
  release();
  await waiting;
  expect(sent).toHaveLength(2);
});

test("a dead served google key is reported from a turn", async () => {
  const ch = channel({ provider: "google", kind: "api_key" });
  const dead = {
    provider: "google",
    kind: "api_key" as const,
    access: "ya29.legacy-oauth-paste",
    expires: 0,
    accountId: null,
  };
  await inTurn(ch, () => {
    reportDeadServedApiKey(dead);
    reportDeadServedApiKey({ ...dead, access: "AIzaRealKey" });
  });
  expect(sent).toHaveLength(1);
  expect(sent[0]?.method).toBe("DELETE");
  expect(sent[0]?.url).toMatch(/\/google$/);
  expect(sent[0]?.headers["x-houston-if-access-sha256"]).toBe(
    accessDigest("ya29.legacy-oauth-paste"),
  );
});

test("a bad credential and exhausted quota mark the served credential", async () => {
  const ch = channel({ kind: "api_key" });
  const badKey: ProviderError = { ...revoked, cause: "invalid_api_key" };
  await inTurn(ch, () => {
    noteAuthFailure("anthropic", "fp");
    reportRevokedServedToken(badKey, undefined);
    reportRevokedServedToken(badKey, undefined);
    noteQuotaExhausted("anthropic", "2026-11-23T10:00:00Z", "fp");
    reportRevokedServedToken(
      { ...badKey, provider: "openai-codex" },
      undefined,
    );
  });
  expect(sent.map((s) => [s.method, s.url, s.body])).toEqual([
    [
      "POST",
      credentialUrl,
      { kind: "needs_reconnect", accessSha256: accessDigest("served-access") },
    ],
    [
      "POST",
      credentialUrl,
      {
        kind: "out_of_credits",
        accessSha256: accessDigest("served-access"),
        resetsAt: "2026-11-23T10:00:00.000Z",
      },
    ],
  ]);
  expect(sent[0]?.headers["x-houston-credential-scope"]).toBe("personal");
});

test("a lapsed or unexplained auth failure never marks the credential for reconnect", async () => {
  await inTurn(channel(), () => {
    for (const cause of [
      "token_expired",
      "unknown",
      "org_policy_blocked",
      "no_credentials",
      "billing_locked",
    ] as const)
      reportRevokedServedToken({ ...revoked, cause }, accessDigest("t"));
  });
  expect(sent).toEqual([]);
});

test("a mark names the token the turn's requests ran on", async () => {
  const ch = channel();
  const capture = newUsedTokenCapture();
  capture.record("anthropic", "re-served-access");
  await inTurn(ch, () => {
    reportRevokedServedToken(
      { ...revoked, message: "please log in again" },
      accessDigest("re-served-access"),
    );
    runWithUsedTokenCapture(capture, () =>
      noteQuotaExhausted("anthropic", null, "fp"),
    );
  });
  expect(sent.map((s) => s.body)).toEqual([
    { kind: "needs_reconnect", accessSha256: accessDigest("re-served-access") },
    { kind: "out_of_credits", accessSha256: accessDigest("re-served-access") },
  ]);
});

test("a non-JSON gateway answer reads as the default and says so", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  answer = () => new Response("<html>ok</html>", { status: 200 });
  await inTurn(channel({ health: "needs_reconnect" }), () => {
    reportRevokedServedToken(revoked, accessDigest("t"));
    clearProviderMarks("anthropic");
  });
  expect(sent.map((s) => s.method).sort()).toEqual(["DELETE", "POST", "POST"]);
  expect(
    warn.mock.calls.filter(([line]) => String(line).includes("non-JSON")),
  ).toHaveLength(3);
  const lines = log.mock.calls.map(([line]) => String(line));
  expect(lines).toContain(
    "[serve] reported revoked anthropic token: superseded, left in place",
  );
  expect(lines).toContain(
    "[turn-credential] reported connected for anthropic: superseded, left in place",
  );
});

test("a clean turn clears the mark only when the credential carried one", async () => {
  await inTurn(channel(), () => clearProviderMarks("anthropic"));
  expect(sent).toEqual([]);
  await inTurn(channel({ health: "out_of_credits" }), () =>
    clearProviderMarks("anthropic"),
  );
  expect(sent.map((s) => s.body)).toEqual([
    { kind: "connected", accessSha256: accessDigest("served-access") },
  ]);
});

test("pod mode never reaches the turn channel", async () => {
  noteAuthFailure("anthropic", "fp");
  noteQuotaExhausted("anthropic", null, "fp");
  clearProviderMarks("anthropic");
  reportRevokedServedToken(revoked, accessDigest("t"));
  await new Promise((r) => setTimeout(r, 10));
  expect(sent).toEqual([]);
});
