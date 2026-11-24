import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { accessDigest } from "@houston/protocol/access-digest";
import type { WireFrame } from "@houston/runtime-client";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { reportRevokedServedToken } from "../auth/report-revoked";
import { executeReadyTurn } from "./execute-ready-turn";
import type { TurnServerDeps } from "./server-types";
import { prepareTurnFilesystem } from "./turn-filesystem";
import type { TurnRequest } from "./types";

const PREFIX = "ws/0123456789abcdef/fedcba9876543210";
const prevFetch = globalThis.fetch;
let gatewayCalls: { url: string; method: string; at: number }[] = [];
let releaseGateway: () => void = () => {};

beforeEach(() => {
  gatewayCalls = [];
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const gate = new Promise<void>((resolve) => {
    releaseGateway = resolve;
  });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    await gate;
    gatewayCalls.push({
      url: String(url),
      method: init?.method ?? "GET",
      at: performance.now(),
    });
    return Response.json({ ok: true, removed: true });
  }) as unknown as typeof globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = prevFetch;
  vi.restoreAllMocks();
});

async function claimedTurn(
  credential: TurnRequest["credential"],
  runTurn: NonNullable<TurnServerDeps["runTurn"]>,
  heartbeatUrl = "https://gw.test/v1/pool/claims/c/heartbeat",
) {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-report-store-"));
  await mkdir(join(storeRoot, ...PREFIX.split("/"), "workspaces/W/A"), {
    recursive: true,
  });
  await writeFile(
    join(storeRoot, ...PREFIX.split("/"), "workspaces/W/A/CLAUDE.md"),
    "# A\n",
  );
  const store = new LocalDirStore(storeRoot);
  const root = await mkdtemp(join(tmpdir(), "turn-report-root-"));
  const filesystem = await prepareTurnFilesystem({
    store,
    prefix: PREFIX,
    root,
    claimed: true,
  });
  const deps = {
    store,
    token: "",
    poolStoreUrl: "https://store.example",
    fetchImpl: (async () =>
      Response.json({ doc: [], revision: 1 })) as unknown as typeof fetch,
    activityDocRetryDelaysMs: [],
    runTurn,
  } as TurnServerDeps;
  const frames: { frame: WireFrame; at: number }[] = [];
  const done = executeReadyTurn({
    deps,
    turn: {
      workspaceId: "w1",
      agentId: "agent-1",
      conversationId: "chat-1",
      text: "hello",
      gcsPrefix: PREFIX,
      shadow: false,
      credential,
      claim: {
        id: "c",
        token: "t",
        bootId: "b",
        heartbeatUrl,
      },
      hostToken: "turn-token",
    } as unknown as TurnRequest,
    turnId: "turn-1",
    root,
    scope: "turn-1",
    authPath: join(root, "auth.json"),
    signal: new AbortController().signal,
    filesystem,
    resolved: { store, prefix: PREFIX },
    heartbeat: null,
    sandbox: null,
    timings: {},
    emit: (frame) => frames.push({ frame, at: performance.now() }),
    turnLog: null,
    transcript: null,
  });
  return { done, frames };
}

test("a revoked-token report lands before the turn's terminal frame", async () => {
  const { done, frames } = await claimedTurn(
    {
      provider: "anthropic",
      kind: "oauth",
      access: "a",
      expires: 1,
      accountId: null,
    },
    async () => {
      reportRevokedServedToken(
        {
          kind: "unauthenticated",
          provider: "anthropic",
          cause: "token_revoked",
          message: "401 OAuth access token has been revoked",
        },
        accessDigest("a"),
      );
      return {};
    },
  );
  await new Promise((r) => setTimeout(r, 50));
  expect(frames.find((f) => f.frame.type === "done")).toBeUndefined();
  releaseGateway();
  await done;
  const terminal = frames.find((f) => f.frame.type === "done");
  const url =
    "https://gw.test/v1/pod/credentials/0123456789abcdef/fedcba9876543210/anthropic";
  expect(gatewayCalls.map((c) => [c.method, c.url]).sort()).toEqual([
    ["DELETE", url],
    ["POST", url],
  ]);
  const lastReport = Math.max(...gatewayCalls.map((c) => c.at));
  expect(terminal?.at).toBeGreaterThanOrEqual(lastReport);
});

test("a malformed claim heartbeat URL still ends the turn with a terminal frame", async () => {
  releaseGateway();
  let ran = false;
  const { done, frames } = await claimedTurn(
    {
      provider: "anthropic",
      kind: "oauth",
      access: "a",
      expires: 1,
      accountId: null,
    },
    async () => {
      ran = true;
      return {};
    },
    "not a url",
  );
  await expect(done).resolves.toBeUndefined();
  expect(ran).toBe(false);
  expect(frames.map((f) => f.frame.type)).toContain("error");
  expect(gatewayCalls).toEqual([]);
});

test("a dead served google key is reported from the turn that was handed it", async () => {
  releaseGateway();
  const { done } = await claimedTurn(
    {
      provider: "google",
      kind: "api_key",
      access: "ya29.legacy-oauth-paste",
      expires: 0,
      accountId: null,
    },
    async () => ({}),
  );
  await done;
  expect(gatewayCalls.map((c) => [c.method, c.url])).toEqual([
    [
      "DELETE",
      "https://gw.test/v1/pod/credentials/0123456789abcdef/fedcba9876543210/google",
    ],
  ]);
});
