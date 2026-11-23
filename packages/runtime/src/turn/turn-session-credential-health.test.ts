import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProviderError } from "@houston/protocol";
import { accessDigest } from "@houston/protocol/access-digest";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { resetAuthFailures } from "../auth/credential-health";
import { resetRevokedReportsForTest } from "../auth/report-revoked";
import { resetTurnRevokedReportsForTest } from "../auth/report-revoked-turn";
import type { TurnCredentialChannel } from "../auth/turn-credential-channel";
import { settleTurnCredentialReports } from "../auth/turn-credential-report";
import { newUsedTokenCapture } from "../auth/used-token";
import { config } from "../config";
import { runWithActingContext } from "../session/acting-context";
import { newInteractionHolder } from "../session/interaction";
import { TurnBackendProviderError } from "./turn-backend";
import { handleTurnSessionFailure } from "./turn-session-failure";
import { finishSuccessfulTurn } from "./turn-session-success";

let bodies: unknown[] = [];
const prevFetch = globalThis.fetch;
const prevDataDir = config.dataDir;

beforeEach(() => {
  bodies = [];
  config.dataDir = mkdtempSync(join(tmpdir(), "turn-health-data-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") bodies.push(JSON.parse(String(init.body)));
    return Response.json({ ok: true, changed: true, removed: false });
  }) as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = prevFetch;
  config.dataDir = prevDataDir;
  resetAuthFailures();
  resetRevokedReportsForTest();
  resetTurnRevokedReportsForTest();
  vi.restoreAllMocks();
});

function channel(
  overrides: Partial<TurnCredentialChannel> = {},
): TurnCredentialChannel {
  return {
    baseUrl: "http://gateway.test",
    orgSlug: "0123456789abcdef",
    agentSlug: "fedcba9876543210",
    hostToken: "turn-token",
    provider: "github-copilot",
    kind: "oauth",
    scope: "team",
    accessSha256: accessDigest("first-served"),
    ...overrides,
  };
}

function reServedCapture() {
  const usedTokens = newUsedTokenCapture();
  usedTokens.record("github-copilot", "first-served");
  usedTokens.record("github-copilot", "re-served");
  return usedTokens;
}

async function failWith(ch: TurnCredentialChannel, error: ProviderError) {
  const dir = mkdtempSync(join(tmpdir(), "turn-health-conv-"));
  runWithActingContext({ credentialChannel: ch }, () =>
    handleTurnSessionFailure({
      error: new TurnBackendProviderError(error),
      assistantText: "",
      tools: [],
      usage: null,
      conversationsDir: dir,
      conversationId: "c1",
      turnId: "t1",
      provider: "github-copilot",
      text: "hello",
      usedTokens: reServedCapture(),
      emit: () => {},
    }),
  );
  await settleTurnCredentialReports(ch);
}

test("a failed turn's health report names the token it re-served onto", async () => {
  await failWith(channel(), {
    kind: "unauthenticated",
    provider: "github-copilot",
    cause: "token_revoked",
    message: "please log in again",
  });
  await failWith(channel(), {
    kind: "quota_exhausted",
    provider: "github-copilot",
    model: null,
    scope: "unknown",
    resets_at: null,
    message: "out of credits",
  });
  expect(bodies).toEqual([
    { kind: "needs_reconnect", accessSha256: accessDigest("re-served") },
    { kind: "out_of_credits", accessSha256: accessDigest("re-served") },
  ]);
});

test("a clean turn heals the token it re-served onto", async () => {
  const ch = channel({ health: "needs_reconnect" });
  const dir = mkdtempSync(join(tmpdir(), "turn-health-ok-"));
  runWithActingContext({ credentialChannel: ch }, () =>
    finishSuccessfulTurn({
      beforeFiles: null,
      workspaceDir: dir,
      mode: "execute",
      assistantText: "done",
      interaction: newInteractionHolder(),
      conversationsDir: dir,
      conversationId: "c1",
      tools: [],
      usage: null,
      provider: "github-copilot",
      turnId: "t1",
      usedTokens: reServedCapture(),
      emit: () => {},
    }),
  );
  await settleTurnCredentialReports(ch);
  expect(bodies).toEqual([
    { kind: "connected", accessSha256: accessDigest("re-served") },
  ]);
});
