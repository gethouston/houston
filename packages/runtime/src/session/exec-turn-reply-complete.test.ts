import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WireEvent, WireFrame } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import type {
  HarnessSession,
  ReplyBeat,
  ResolvedModel,
} from "../backends/types";

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-rc-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-rc-ws-"),
);

const state = vi.hoisted(() => ({ model: null as ResolvedModel | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => state.model,
    activeProvider: () => "anthropic",
    activeEffort: () => null,
  };
});
vi.mock("./mission-settle", () => ({ reportMissionSettle: () => {} }));

await import("./conversation-cache");
const { execTurn } = await import("./exec-turn");
const bus = await import("./bus");
type Conversation = import("./conversation-cache").Conversation;

class OfferingSession implements HarnessSession {
  private wire = new Set<(e: WireEvent) => void>();
  private starts = new Set<() => void>();
  private beats = new Set<(b: ReplyBeat) => void>();
  constructor(private readonly closingText: string) {}
  subscribe(l: (e: WireEvent) => void): () => void {
    this.wire.add(l);
    return () => this.wire.delete(l);
  }
  subscribeAssistantMessageStart(l: () => void): () => void {
    this.starts.add(l);
    return () => this.starts.delete(l);
  }
  subscribeReplyBeats(l: (b: ReplyBeat) => void): () => void {
    this.beats.add(l);
    return () => this.beats.delete(l);
  }
  async prompt(): Promise<void> {
    for (const l of this.starts) l();
    if (this.closingText)
      for (const l of this.wire) l({ type: "text", data: this.closingText });
    for (const l of this.beats)
      l({ type: "tool_call_start", name: "mcp__houston__suggest_actions" });
    for (const l of this.wire)
      l({
        type: "tool_start",
        data: { name: "mcp__houston__suggest_actions", args: {} },
      });
    for (const l of this.wire)
      l({
        type: "tool_end",
        data: { name: "mcp__houston__suggest_actions", isError: false },
      });
  }
  async abort(): Promise<void> {}
  dispose(): void {}
  async setModel(): Promise<void> {}
  async compact(): Promise<undefined> {}
  setThinkingLevel(): void {}
  getContextUsage(): { tokens: number | null } {
    return { tokens: 100 };
  }
}

const convWith = (session: HarnessSession) =>
  ({
    session,
    queue: Promise.resolve(),
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    backendId: "anthropic",
    mode: "execute",
  }) as unknown as Conversation;

afterEach(() => {
  state.model = null;
});

async function runTurn(id: string, closingText: string): Promise<string[]> {
  state.model = {
    provider: "anthropic",
    id: "claude-sonnet-5-5",
    contextWindow: 1_000_000,
  };
  const frames: WireFrame[] = [];
  const unsub = bus.subscribe(id, (f) => frames.push(f));
  await execTurn(
    convWith(new OfferingSession(closingText)),
    id,
    `t-${id}`,
    "hi",
    {
      author: undefined,
      priorAuthors: [],
    },
  );
  unsub();
  expect(frames.every((f) => f.type === "user" || f.turnId === `t-${id}`)).toBe(
    true,
  );
  return frames.map((f) => f.type).filter((t) => t !== "user");
}

test("reply_complete precedes the offer's tool frames and done", async () => {
  const types = await runTurn("conv-rc-1", "Here is the report.");
  expect(types).toEqual([
    "text",
    "reply_complete",
    "tool_start",
    "tool_end",
    "done",
  ]);
});

test("an offer with no closing text (NEEDS_MESSAGE) emits no reply_complete", async () => {
  const types = await runTurn("conv-rc-2", "");
  expect(types).not.toContain("reply_complete");
  expect(types.at(-1)).toBe("done");
});
