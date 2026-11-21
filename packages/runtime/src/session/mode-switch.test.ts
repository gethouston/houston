import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TurnMode } from "@houston/protocol";
import type { WireEvent } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type {
  CreateSessionOptions,
  HarnessBackend,
  HarnessSession,
  ResolvedModel,
} from "../backends/types";

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-mode-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-mode-ws-"),
);

const modelState = vi.hoisted(() => ({ model: null as ResolvedModel | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => modelState.model,
    activeEffort: () => null,
  };
});

await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
const { switchModeIfNeeded, getConversation, conversations } = await import(
  "./conversation-cache"
);
const { registerBackend, setDefaultBackend } = await import(
  "../backends/registry"
);
const { subscribe } = await import("./bus");
type Conversation = import("./conversation-cache").Conversation;

class HistSession implements HarnessSession {
  disposed = false;
  private listeners = new Set<(e: WireEvent) => void>();
  constructor(
    readonly backendId: string,
    readonly builtMode: TurnMode,
    readonly prompts: string[],
    readonly builtSuggestions = true,
    readonly timezone?: string,
  ) {}
  subscribe(l: (e: WireEvent) => void): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }
  async prompt(text: string): Promise<void> {
    this.prompts.push(text);
  }
  async abort(): Promise<void> {}
  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 0 };
  }
}

function histBackend(
  id: string,
  disk: Map<string, string[]>,
  built: HistSession[],
): HarnessBackend {
  return {
    id,
    async createSession(opts: CreateSessionOptions): Promise<HarnessSession> {
      const transcript = disk.get(opts.conversationId) ?? [];
      disk.set(opts.conversationId, transcript);
      const s = new HistSession(
        id,
        opts.mode ?? "execute",
        transcript,
        opts.nextStepSuggestions,
        opts.timezone,
      );
      built.push(s);
      return s;
    },
  };
}

afterEach(() => {
  modelState.model = null;
  conversations.clear();
});

const OPENAI: ResolvedModel = {
  provider: "openai-codex",
  id: "gpt-5-codex",
  contextWindow: 400_000,
};
const ANTHROPIC: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-5",
  contextWindow: 200_000,
};

test("switchModeIfNeeded no-ops when the mode is unchanged", async () => {
  const disk = new Map<string, string[]>();
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  const session = new HistSession("pi", "execute", []);
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;

  const res = await switchModeIfNeeded(conv, "c", OPENAI, "execute");
  expect(res.rebuilt).toBe(false);
  expect(session.disposed).toBe(false);
  expect(conv.session).toBe(session);
  expect(built).toHaveLength(0);
});

test("switchModeIfNeeded rebuilds on a flip and the rebuilt session keeps prior history", async () => {
  const disk = new Map<string, string[]>([["c", ["earlier turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  const session = new HistSession("pi", "execute", disk.get("c") as string[]);
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;

  const res = await switchModeIfNeeded(conv, "c", OPENAI, "plan");
  expect(res.rebuilt).toBe(true);
  expect(session.disposed).toBe(true);
  expect(conv.mode).toBe("plan");
  expect(built).toHaveLength(1);
  expect(built[0].builtMode).toBe("plan");
  expect(built[0].prompts).toEqual(["earlier turn"]);
  const back = await switchModeIfNeeded(conv, "c", OPENAI, "execute");
  expect(back.rebuilt).toBe(true);
  expect(conv.mode).toBe("execute");
  expect(built[1].builtMode).toBe("execute");
  expect(built[1].prompts).toEqual(["earlier turn"]);
});

test("switchModeIfNeeded rebuilds execute→auto and the rebuilt session keeps prior history", async () => {
  const disk = new Map<string, string[]>([["c", ["earlier turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  const session = new HistSession("pi", "execute", disk.get("c") as string[]);
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;

  const res = await switchModeIfNeeded(conv, "c", OPENAI, "auto");
  expect(res.rebuilt).toBe(true);
  expect(session.disposed).toBe(true);
  expect(conv.mode).toBe("auto");
  expect(built).toHaveLength(1);
  expect(built[0].builtMode).toBe("auto");
  expect(built[0].prompts).toEqual(["earlier turn"]);
  const toPlan = await switchModeIfNeeded(conv, "c", OPENAI, "plan");
  expect(toPlan.rebuilt).toBe(true);
  expect(conv.mode).toBe("plan");
  expect(built[1].builtMode).toBe("plan");
  expect(built[1].prompts).toEqual(["earlier turn"]);
});

test("getConversation records the pin's mode and builds the session at it", async () => {
  const disk = new Map<string, string[]>();
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  modelState.model = OPENAI;

  const conv = await getConversation("c-init", {
    provider: "openai-codex",
    model: "gpt-5-codex",
    mode: "plan",
  });
  expect(conv.mode).toBe("plan");
  expect(built).toHaveLength(1);
  expect(built[0].builtMode).toBe("plan");
});

test("getConversation defaults to execute when the pin sets no mode", async () => {
  const disk = new Map<string, string[]>();
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  modelState.model = OPENAI;

  const conv = await getConversation("c-default", {});
  expect(conv.mode).toBe("execute");
  expect(built[0].builtMode).toBe("execute");
});

test("a mode-only flip through execTurn rebuilds read-only, keeps history, and emits NO provider_switched", async () => {
  const disk = new Map<string, string[]>([["conv-flip", ["prior turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  registerBackend("anthropic", histBackend("anthropic", new Map(), []));

  const session = new HistSession(
    "pi",
    "execute",
    disk.get("conv-flip") as string[],
  );
  const conv = {
    session,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;
  modelState.model = OPENAI;

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-flip", (e) => events.push(e));
  await execTurn(
    conv,
    "conv-flip",
    "turn-plan",
    "draft me a plan",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  expect(session.disposed).toBe(true);
  expect(conv.mode).toBe("plan");
  expect(built).toHaveLength(1);
  expect(built[0].builtMode).toBe("plan");
  expect(built[0].prompts).toEqual(["prior turn", "draft me a plan"]);
  expect(events.some((e) => e.type === "provider_switched")).toBe(false);
});

test("a cross-backend switch that also flips mode lands on plan in a SINGLE rebuild", async () => {
  const piDisk = new Map<string, string[]>([["conv-x", ["pi turn"]]]);
  const claudeDisk = new Map<string, string[]>();
  const piBuilt: HistSession[] = [];
  const claudeBuilt: HistSession[] = [];
  setDefaultBackend(histBackend("pi", piDisk, piBuilt));
  registerBackend(
    "anthropic",
    histBackend("anthropic", claudeDisk, claudeBuilt),
  );

  const piSession = new HistSession(
    "pi",
    "execute",
    piDisk.get("conv-x") as string[],
  );
  const conv = {
    session: piSession,
    queue: Promise.resolve(),
    provider: "openai-codex",
    model: "gpt-5-codex",
    backendId: "pi",
    mode: "execute",
  } as unknown as Conversation;
  modelState.model = ANTHROPIC;

  const events: WireEvent[] = [];
  const unsub = subscribe("conv-x", (e) => events.push(e));
  await execTurn(
    conv,
    "conv-x",
    "turn-1",
    "plan across backends",
    { author: undefined, priorAuthors: [] },
    { mode: "plan" },
  );
  unsub();

  expect(piSession.disposed).toBe(true);
  expect(conv.backendId).toBe("anthropic");
  expect(conv.mode).toBe("plan");
  expect(claudeBuilt).toHaveLength(1);
  expect(claudeBuilt[0].builtMode).toBe("plan");
  expect(events.some((e) => e.type === "provider_switched")).toBe(true);
});

test("changing the suggestion preference rebuilds the cached session and keeps history", async () => {
  const disk = new Map<string, string[]>([["suggestions", ["earlier turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  modelState.model = OPENAI;
  const conv = await getConversation("suggestions");
  expect(
    (await switchModeIfNeeded(conv, "suggestions", OPENAI, "execute", false))
      .rebuilt,
  ).toBe(true);
  expect(built[1].builtSuggestions).toBe(false);
  expect(built[1].prompts).toEqual(["earlier turn"]);
  expect(
    (await switchModeIfNeeded(conv, "suggestions", OPENAI, "execute", false))
      .rebuilt,
  ).toBe(false);
  expect(
    (await switchModeIfNeeded(conv, "suggestions", OPENAI, "execute", true))
      .rebuilt,
  ).toBe(true);
  expect(built[2].builtSuggestions).toBe(true);
});

test("a changed workspace timezone rebuilds the prompt while keeping conversation history", async () => {
  const disk = new Map<string, string[]>([["timezone", ["earlier turn"]]]);
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  modelState.model = OPENAI;
  const conv = await getConversation("timezone", {
    timezone: "America/Bogota",
  });
  expect(built[0].timezone).toBe("America/Bogota");
  expect(
    (
      await switchModeIfNeeded(
        conv,
        "timezone",
        OPENAI,
        "execute",
        true,
        "Europe/Paris",
      )
    ).rebuilt,
  ).toBe(true);
  expect(built[1].timezone).toBe("Europe/Paris");
  expect(built[1].prompts).toEqual(["earlier turn"]);
  expect(
    (
      await switchModeIfNeeded(
        conv,
        "timezone",
        OPENAI,
        "execute",
        true,
        "Europe/Paris",
      )
    ).rebuilt,
  ).toBe(false);
});

test.each([
  "UTC",
  "America/New_York",
])("alternating pod sends and host fires in %s keep the same cached session", async (timezone) => {
  const disk = new Map<string, string[]>();
  const built: HistSession[] = [];
  setDefaultBackend(histBackend("pi", disk, built));
  modelState.model = OPENAI;
  const conv = await getConversation("pod-zone", { timezone });
  const session = conv.session;
  for (const text of [
    "user send",
    "host fire",
    "user follow-up",
    "host fire again",
  ]) {
    await execTurn(
      conv,
      "pod-zone",
      text,
      text,
      { author: undefined, priorAuthors: [] },
      { timezone },
    );
    expect(conv.session).toBe(session);
  }
  expect(built).toHaveLength(1);
  expect(built[0].prompts).toEqual([
    "user send",
    "host fire",
    "user follow-up",
    "host fire again",
  ]);
});
