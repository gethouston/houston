import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, test } from "vitest";
import { makeToolResultContext } from "./tool-result-context";

type AgentMessage = AgentSession["messages"][number];

let workspaceDir: string;
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "tool-result-context-"));
});
afterEach(() => rmSync(workspaceDir, { recursive: true, force: true }));

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

/** One tool round: the assistant's call, then its result. */
function round(id: string, toolName: string, text: string): AgentMessage[] {
  return [
    {
      role: "assistant",
      content: [{ type: "toolCall", id, name: toolName, arguments: {} }],
      api: "openai-codex-responses",
      provider: "openai-codex",
      model: "gpt-6-astra",
      usage,
      stopReason: "toolUse",
      timestamp: 0,
    },
    {
      role: "toolResult",
      toolCallId: id,
      toolName,
      content: [{ type: "text", text }],
      isError: false,
      timestamp: 0,
    },
  ] as AgentMessage[];
}

const user = (text: string) =>
  ({ role: "user", content: text, timestamp: 0 }) as AgentMessage;

/** Text a reader can tell apart from any other result of the same size. */
const payload = (tag: string, chars: number) =>
  `${tag}:`.padEnd(chars, `${tag} `);

function resultText(messages: AgentMessage[], id: string): string {
  const m = messages.find(
    (x) => x.role === "toolResult" && x.toolCallId === id,
  );
  if (m?.role !== "toolResult") throw new Error(`no result ${id}`);
  return m.content.map((c) => (c.type === "text" ? c.text : "")).join("");
}

const savedAt = (text: string) => /saved at (\S+) \(/.exec(text)?.[1];

/** A chat whose first rounds fetched ~19k-character app payloads. */
function history(rounds: number): AgentMessage[] {
  const out: AgentMessage[] = [user("Summarize my inbox")];
  for (let i = 0; i < rounds; i++)
    out.push(
      ...round(`call-${i}`, "integration_execute", payload(`mail${i}`, 19_000)),
    );
  return out;
}

test("an oversized app result is cut to its head, and the rest is in the file it names", async () => {
  const transform = makeToolResultContext({
    workspaceDir,
    conversationId: "c1",
  });
  const full = payload("gmail", 64_000);
  const sent = await transform([
    user("Read my latest emails"),
    ...round("call-1", "integration_execute", full),
  ]);

  const text = resultText(sent, "call-1");
  expect(text.startsWith(full.slice(0, 20_000))).toBe(true);
  expect(text.length).toBeLessThan(20_500);
  const path = savedAt(text);
  expect(path).toMatch(
    /^\.tool-results\/c1\/integration_execute-[0-9a-f]{16}\.txt$/,
  );
  expect(readFileSync(join(workspaceDir, path ?? ""), "utf8")).toBe(full);
});

test("a file tool's result is never cut: it is how the model reads the rest", async () => {
  const transform = makeToolResultContext({
    workspaceDir,
    conversationId: "c1",
  });
  const big = payload("file", 40_000);
  const sent = await transform([user("open it"), ...round("r1", "read", big)]);
  expect(resultText(sent, "r1")).toBe(big);
});

test("stale results stay until they add up to a batch, then all go at once", async () => {
  const transform = makeToolResultContext({
    workspaceDir,
    conversationId: "c1",
  });

  // Nine rounds: rounds 0-5 are stale (older than the last three), 6 x 19k
  // = 114k characters, under the 120k batch. Nothing changes yet.
  const before = await transform(history(9));
  for (let i = 0; i < 9; i++)
    expect(resultText(before, `call-${i}`)).toBe(payload(`mail${i}`, 19_000));

  // Round 6 goes stale with the tenth round: 133k, one batch.
  const after = await transform(history(10));
  for (let i = 0; i <= 6; i++) {
    const stub = resultText(after, `call-${i}`);
    expect(stub).toMatch(
      /^\[Cleared tool result: integration_execute, 19,000 characters\./,
    );
    expect(readFileSync(join(workspaceDir, savedAt(stub) ?? ""), "utf8")).toBe(
      payload(`mail${i}`, 19_000),
    );
  }
  // The three newest rounds, the one about to be read included, are whole.
  for (let i = 7; i < 10; i++)
    expect(resultText(after, `call-${i}`)).toBe(payload(`mail${i}`, 19_000));

  // Every call keeps its result: providers refuse an unpaired tool call.
  const calls = after.flatMap((m) =>
    m.role === "assistant"
      ? m.content.filter((c) => c.type === "toolCall").map((c) => c.id)
      : [],
  );
  const results = after.flatMap((m) =>
    m.role === "toolResult" ? [m.toolCallId] : [],
  );
  expect(results).toEqual(calls);
});

test("a cleared prefix is sent the same on every later request until the next batch", async () => {
  const transform = makeToolResultContext({
    workspaceDir,
    conversationId: "c1",
  });
  const at10 = await transform(history(10));
  const at12 = await transform(history(12));
  // Rounds 7 and 8 went stale since, 38k characters, short of a new batch:
  // the first ten rounds read exactly as they did, so the cache still holds.
  expect(at12.slice(0, at10.length)).toEqual(at10);
  expect(resultText(at12, "call-7")).toBe(payload("mail7", 19_000));
});

test("the session's own messages are never modified", async () => {
  const transform = makeToolResultContext({
    workspaceDir,
    conversationId: "c1",
  });
  const messages = history(10);
  const snapshot = structuredClone(messages);
  await transform(messages);
  expect(messages).toEqual(snapshot);
});

test("a cleared screenshot is saved as an image file the stub names", async () => {
  const png = Buffer.from("screenshot bytes");
  const image = {
    type: "image" as const,
    data: png.toString("base64"),
    mimeType: "image/png",
  };
  const messages = history(10).map((m) =>
    m.role === "toolResult" && m.toolCallId === "call-0"
      ? { ...m, toolName: "browser", content: [image] }
      : m,
  );
  const sent = await makeToolResultContext({
    workspaceDir,
    conversationId: "c1",
  })(messages);
  const stub = resultText(sent, "call-0");
  expect(stub).toMatch(/^\[Cleared tool result: browser, 6,400 characters\./);
  const path = /saved at (\S+\.png) \(/.exec(stub)?.[1] ?? "";
  expect(readFileSync(join(workspaceDir, path))).toEqual(png);
});
