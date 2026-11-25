import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Activity } from "@houston/protocol";
import { beforeEach, expect, test, vi } from "vitest";
import type { HarnessBackend, HarnessSession } from "../backends/types";
import { runTurn, type TurnDirectories } from "./turn-session";

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: { provider: "openai-codex", id: "gpt-5.5", contextWindow: 200_000 },
  }),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

const FALLBACK = "Write the weekly...";
const TEXT = "Write the weekly sales report for the team";

async function directories(): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "turn-session-title-"));
  const workspaceDir = join(turnRoot, "workspace");
  const dataDir = join(workspaceDir, ".houston", "runtime");
  await mkdir(join(workspaceDir, ".houston", "activity"), { recursive: true });
  await mkdir(dataDir, { recursive: true });
  const card: Activity = {
    id: "m1",
    title: FALLBACK,
    description: "",
    status: "running",
  };
  await writeFile(activityPath(workspaceDir), JSON.stringify([card]));
  return { turnRoot, workspaceDir, dataDir };
}

const activityPath = (workspaceDir: string) =>
  join(workspaceDir, ".houston", "activity", "activity.json");

async function cardTitle(dirs: TurnDirectories) {
  const cards = JSON.parse(
    await readFile(activityPath(dirs.workspaceDir), "utf8"),
  ) as Activity[];
  return cards[0]?.title;
}

type Ending = "reply" | "provider_error" | "throw" | "user_cancel";

function backend(
  order: string[],
  ending: Ending,
  cancel: AbortController,
): HarnessBackend {
  return {
    id: "pi",
    async createSession() {
      let listener: ((e: never) => void) | undefined;
      const onStart = new Set<() => void>();
      return {
        subscribe: (fn: (e: never) => void) => {
          listener = fn;
          return () => undefined;
        },
        subscribeAssistantMessageStart: (fn: () => void) => {
          onStart.add(fn);
          return () => onStart.delete(fn);
        },
        prompt: async () => {
          order.push("response_open");
          for (const fn of onStart) fn();
          await new Promise((resolve) => setTimeout(resolve, 10));
          for (const fn of onStart) fn();
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (ending === "throw") throw new Error("socket closed");
          if (ending === "user_cancel") return void cancel.abort();
          listener?.(
            (ending === "provider_error"
              ? {
                  type: "provider_error",
                  data: { kind: "rate_limited", provider: "openai-codex" },
                }
              : { type: "text", data: "Here is the report." }) as never,
          );
          order.push("reply_done");
        },
        abort: async () => undefined,
        dispose: () => undefined,
        setModel: async () => undefined,
        compact: async () => undefined,
        setThinkingLevel: () => undefined,
        getContextUsage: () => undefined,
      } as unknown as HarnessSession;
    },
  };
}

function run(
  dirs: TurnDirectories,
  order: string[],
  { ending = "reply", titleMs = 0 }: { ending?: Ending; titleMs?: number } = {},
) {
  const signals: AbortSignal[] = [];
  const cancel = new AbortController();
  const titleRunner = vi.fn((_excerpt: string, signal: AbortSignal) => {
    order.push("title_start");
    signals.push(signal);
    if (ending !== "reply") return new Promise<string>(() => undefined);
    return new Promise<string>((resolve) =>
      setTimeout(() => resolve("Weekly sales report"), titleMs),
    );
  });
  const outcome = runTurn(
    dirs,
    {
      conversationId: "activity-m1",
      text: TEXT,
      provider: "openai-codex",
      emit: () => undefined,
      signal: cancel.signal,
      turnId: "t1",
      missionTitle: { fallback: FALLBACK, text: TEXT },
    },
    { createBackend: () => backend(order, ending, cancel), titleRunner },
  );
  return { outcome, titleRunner, signals };
}

test("the title starts once, when the response opens, beside the reply", async () => {
  const dirs = await directories();
  const order: string[] = [];
  const { outcome, titleRunner } = run(dirs, order);
  const result = await outcome;
  expect(order).toEqual(["response_open", "title_start", "reply_done"]);
  expect(titleRunner).toHaveBeenCalledOnce();
  expect(result.missionTitle?.outcome).toBe("written");
  expect(result.missionTitle?.waitMs).toEqual(expect.any(Number));
  expect(await cardTitle(dirs)).toBe("Weekly sales report");
});

test("a provider failure after the response opened drops the title", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dirs = await directories();
  const order: string[] = [];
  const { outcome, signals } = run(dirs, order, { ending: "provider_error" });
  const result = await outcome;
  expect(order).toContain("title_start");
  expect(signals[0]?.aborted).toBe(true);
  expect(result.missionTitle).toBeUndefined();
  expect(result.providerError?.kind).toBe("rate_limited");
  expect(await cardTitle(dirs)).toBe(FALLBACK);
  expect(
    error.mock.calls.some((c) => String(c[0]).includes("[mission-title]")),
  ).toBe(false);
});

test("a turn that throws after the response opened drops the title", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dirs = await directories();
  const order: string[] = [];
  const { outcome, signals } = run(dirs, order, { ending: "throw" });
  const result = await outcome;
  expect(result.missionTitle).toBeUndefined();
  expect(signals[0]?.aborted).toBe(true);
  expect(await cardTitle(dirs)).toBe(FALLBACK);
});

test("a user's cancel drops the title", async () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const dirs = await directories();
  const { outcome, signals } = run(dirs, [], { ending: "user_cancel" });
  const result = await outcome;
  expect(result.missionTitle).toBeUndefined();
  expect(signals[0]?.aborted).toBe(true);
  expect(await cardTitle(dirs)).toBe(FALLBACK);
});

test("a title slower than the reply is awaited and written", async () => {
  const dirs = await directories();
  const order: string[] = [];
  const { outcome } = run(dirs, order, { titleMs: 60 });
  const result = await outcome;
  expect(order).toEqual(["response_open", "title_start", "reply_done"]);
  expect(result.missionTitle?.outcome).toBe("written");
  expect(result.missionTitle?.waitMs).toBeGreaterThan(0);
  expect(await cardTitle(dirs)).toBe("Weekly sales report");
});
