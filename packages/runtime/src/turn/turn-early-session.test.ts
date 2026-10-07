import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  createSdkMcpServer,
  Options,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { WireFrame } from "@houston/runtime-client";
import { beforeEach, expect, test, vi } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import type { ClaudeSdk } from "../backends/claude/sdk-loader";
import { turnClaudeLayout } from "./turn-backend";
import { startEarlyTurnSession } from "./turn-early-session";
import { runInTurnScope } from "./turn-scope";
import {
  runTurn,
  type TurnDirectories,
  type TurnSessionRequest,
} from "./turn-session";
import { startTurnSession } from "./turn-session-startup";
import type { TurnRequest } from "./types";

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: {
      provider: "anthropic",
      id: "claude-sonnet-4-6",
      contextWindow: 200_000,
      reasoning: true,
    },
  }),
}));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

async function directories(withToken = true): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "claude-early-session-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  writeAuthFile(
    join(dataDir, "auth.json"),
    withToken
      ? {
          anthropic: {
            type: "oauth",
            access: "sk-ant-oat01-test",
            refresh: "",
            expires: Date.now() + 60_000,
          },
        }
      : {},
  );
  return { turnRoot, workspaceDir, dataDir };
}

async function seedResumable(dirs: TurnDirectories, sessionId: string) {
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, "c1");
  const slug = dirs.workspaceDir.replace(/[^A-Za-z0-9]/g, "-");
  await mkdir(join(layout.configDir, "projects", slug), { recursive: true });
  await writeFile(
    join(layout.configDir, "projects", slug, `${sessionId}.jsonl`),
    "{}\n",
  );
  await writeFile(layout.sessionsFile, JSON.stringify({ c1: sessionId }));
}

async function* reply(): AsyncGenerator<SDKMessage> {
  yield {
    type: "result",
    subtype: "success",
    usage: { input_tokens: 10, output_tokens: 2 },
    session_id: "session-next",
  } as unknown as SDKMessage;
}

/** The SDK, scripted: what spawned, how, and which prompt ran where. */
function fakeSdk() {
  const log: string[] = [];
  const spawned: Options[] = [];
  const sdk: ClaudeSdk = {
    query: ({ prompt }) => {
      log.push(`cold:${prompt}`);
      return reply();
    },
    createSdkMcpServer: ((input: { name: string }) => ({
      type: "sdk",
      name: input.name,
      instance: {},
    })) as typeof createSdkMcpServer,
    startup: async ({ options }) => {
      log.push("spawn");
      spawned.push(options);
      return {
        query(prompt) {
          if (typeof prompt !== "string") {
            log.push("exited");
            return reply();
          }
          log.push(`warm:${prompt}`);
          return reply();
        },
        close: () => log.push("closed"),
      };
    },
  };
  return { sdk, log, spawned };
}

const TURN = {
  workspaceId: "w1",
  agentId: "a1",
  conversationId: "c1",
  text: "hello",
  gcsPrefix: "p",
} as TurnRequest;

function begin(
  dirs: TurnDirectories,
  sdk: ClaudeSdk,
  overrides: {
    turn?: Partial<TurnRequest>;
    provider?: string;
    noEarly?: boolean;
  } = {},
) {
  const frames: WireFrame[] = [];
  const turn = { ...TURN, ...overrides.turn } as TurnRequest;
  const request: TurnSessionRequest = {
    conversationId: turn.conversationId,
    text: turn.text,
    provider: overrides.provider ?? "anthropic",
    emit: (frame) => frames.push(frame),
    signal: undefined,
    turnId: "turn-1",
  };
  const deps = { claudeSdk: sdk };
  const startup = startTurnSession(dirs, request, deps);
  const early = overrides.noEarly
    ? undefined
    : startEarlyTurnSession({
        turn,
        request: { ...request, startup },
        directories: dirs,
        authPath: join(dirs.dataDir, "auth.json"),
        poolStoreUrl: undefined,
      });
  // The prompt path runs in the turn's scope, as executeReadyTurn runs it.
  const run = () =>
    runInTurnScope(
      {
        turn,
        authPath: join(dirs.dataDir, "auth.json"),
        poolStoreUrl: undefined,
      },
      () =>
        runTurn(
          dirs,
          { ...request, startup, ...(early ? { early } : {}) },
          deps,
        ),
    );
  return { early, run, frames };
}

test("a resumed conversation's CLI starts early on its session and the prompt runs on it", async () => {
  const dirs = await directories();
  await seedResumable(dirs, "session-old");
  const { sdk, log, spawned } = fakeSdk();
  const { early, run } = begin(dirs, sdk);

  await early?.opened;
  expect(log).toEqual(["spawn"]);
  expect(spawned[0]?.resume).toBe("session-old");
  expect(spawned[0]?.cwd).toBe(dirs.workspaceDir);

  const outcome = await run();
  expect(outcome.error).toBeUndefined();
  expect(log).toEqual(["spawn", "warm:hello"]);
  await early?.close();
  expect(log).toEqual(["spawn", "warm:hello"]);
});

test("a new conversation's early CLI starts a fresh session", async () => {
  const dirs = await directories();
  const { sdk, log, spawned } = fakeSdk();
  const { early, run } = begin(dirs, sdk);
  await run();
  expect(spawned[0]?.resume).toBeUndefined();
  expect(log).toEqual(["spawn", "warm:hello"]);
  await early?.close();
});

test("a turn that never prompts stops its early CLI", async () => {
  const dirs = await directories();
  const { sdk, log } = fakeSdk();
  const { early } = begin(dirs, sdk);
  await early?.close();
  expect(log).toEqual(["spawn", "exited"]);
});

test("an early open fails the turn exactly as the prompt path's own open", async () => {
  // No Anthropic token on a pooled turn's personal scope: the refusal needs
  // the turn's acting scope, which the early open must enter too.
  const viaPrompt = begin(await directories(false), fakeSdk().sdk, {
    noEarly: true,
  });
  const expected = await viaPrompt.run();
  const failure = viaPrompt.frames.find((f) => f.type === "provider_error");
  expect(failure).toBeDefined();

  const { sdk, log } = fakeSdk();
  const early = begin(await directories(false), sdk);
  expect((await early.early?.opened)?.kind).toBe("failed");
  expect(await early.run()).toEqual(expected);
  expect(early.frames.find((f) => f.type === "provider_error")).toEqual(
    failure,
  );
  expect(log).toEqual([]);
});

test("routine chats and non-Claude turns open their session at the prompt", async () => {
  const dirs = await directories();
  const { sdk } = fakeSdk();
  expect(
    begin(dirs, sdk, { turn: { conversationId: "routine-r1" } }).early,
  ).toBeUndefined();
  expect(begin(dirs, sdk, { provider: "openai-codex" }).early).toBeUndefined();
  expect(
    begin(dirs, sdk, {
      turn: { routine: {} } as Partial<TurnRequest>,
    }).early,
  ).toBeUndefined();
});
