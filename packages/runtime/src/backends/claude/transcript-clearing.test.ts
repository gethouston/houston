import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { cappedResultText } from "../../session/tool-results/cap";
import { spillToolResult } from "../../session/tool-results/spill";
import { createSessionsStore } from "./sessions-store";

/**
 * The CLI's transcript, in the shape SDK 0.3.310 writes it: one entry per
 * assistant content block (sharing the message id), each tool result in its
 * own user entry beside the CLI's `toolUseResult` copy, and bookkeeping lines
 * that never mention a tool.
 */

let root: string;
let workspaceDir: string;
let transcript: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "transcript-clearing-"));
  workspaceDir = join(root, "Agent");
  mkdirSync(workspaceDir);
  const slugDir = join(
    root,
    "cfg",
    "projects",
    workspaceDir.replace(/[^A-Za-z0-9]/g, "-"),
  );
  mkdirSync(slugDir, { recursive: true });
  transcript = join(slugDir, "sdk-1.jsonl");
  writeFileSync(join(root, "sessions.json"), JSON.stringify({ c1: "sdk-1" }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const payload = (tag: string, chars: number) =>
  `${tag}:`.padEnd(chars, `${tag} `);

function chat(rounds: number): string[] {
  const lines = [
    JSON.stringify({ type: "queue-operation", operation: "enqueue" }),
    JSON.stringify({
      type: "user",
      uuid: "u0",
      message: { role: "user", content: "Summarize my inbox" },
    }),
  ];
  for (let i = 0; i < rounds; i++) {
    const text = payload(`mail${i}`, 19_000);
    lines.push(
      JSON.stringify({
        type: "assistant",
        uuid: `a${i}-text`,
        message: {
          id: `msg_${i}`,
          role: "assistant",
          content: [{ type: "text", text: "Checking." }],
        },
      }),
      JSON.stringify({
        type: "assistant",
        uuid: `a${i}-tool`,
        message: {
          id: `msg_${i}`,
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: `toolu_${i}`,
              name: "mcp__houston__integration_execute",
              input: {},
            },
          ],
        },
      }),
      JSON.stringify({
        type: "user",
        uuid: `r${i}`,
        message: {
          role: "user",
          content: [
            {
              tool_use_id: `toolu_${i}`,
              type: "tool_result",
              content: [{ type: "text", text }],
            },
          ],
        },
        toolUseResult: [{ type: "text", text }],
      }),
    );
  }
  return lines;
}

function resumed() {
  return createSessionsStore({
    configDir: join(root, "cfg"),
    sessionsFile: join(root, "sessions.json"),
    cwd: workspaceDir,
  }).resolveResume("c1");
}
const resume = () => resumed()?.sessionId;

function resultSent(lines: string[], id: string): string {
  for (const line of lines) {
    const entry = JSON.parse(line);
    for (const block of entry.message?.content ?? []) {
      if (block.type === "tool_result" && block.tool_use_id === id)
        return typeof block.content === "string"
          ? block.content
          : block.content.map((c: { text: string }) => c.text).join("");
    }
  }
  throw new Error(`no result ${id}`);
}

test("stale results under one batch are left alone", () => {
  writeFileSync(transcript, chat(9).join("\n"));
  expect(resume()).toBe("sdk-1");
  expect(readFileSync(transcript, "utf8")).toBe(chat(9).join("\n"));
});

test("a batch of stale results becomes stubs pointing at their saved copies", () => {
  const original = chat(10);
  writeFileSync(transcript, original.join("\n"));
  expect(resume()).toBe("sdk-1");

  const lines = readFileSync(transcript, "utf8").split("\n");
  expect(lines).toHaveLength(original.length);
  for (let i = 0; i <= 6; i++) {
    const stub = resultSent(lines, `toolu_${i}`);
    expect(stub).toMatch(
      /^\[Cleared tool result: integration_execute, 19,000 characters\./,
    );
    const path = /saved at (\S+) \(/.exec(stub)?.[1] ?? "";
    expect(readFileSync(join(workspaceDir, path), "utf8")).toBe(
      payload(`mail${i}`, 19_000),
    );
  }
  // The newest rounds and every line that is not a cleared result are untouched.
  for (let i = 7; i < 10; i++)
    expect(resultSent(lines, `toolu_${i}`)).toBe(payload(`mail${i}`, 19_000));
  const changed = lines.filter((line, i) => line !== original[i]);
  expect(changed).toHaveLength(7);
});

test("a cleared transcript is not rewritten again until the next batch", () => {
  writeFileSync(transcript, chat(10).join("\n"));
  resume();
  const cleared = readFileSync(transcript, "utf8");
  resume();
  expect(readFileSync(transcript, "utf8")).toBe(cleared);

  // Two more rounds: 38k characters newly stale, short of a batch.
  const grown = [...cleared.split("\n"), ...chat(12).slice(-6)];
  writeFileSync(transcript, grown.join("\n"));
  resume();
  expect(readFileSync(transcript, "utf8")).toBe(grown.join("\n"));
});

test("a cleared screenshot is saved as an image file the stub names", () => {
  const png = Buffer.from("not really a png, but bytes all the same");
  const image = {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: png.toString("base64"),
    },
  };
  const lines = chat(10).map((line) => {
    const entry = JSON.parse(line);
    const block = entry.message?.content?.[0];
    if (block?.type !== "tool_result") return line;
    if (block.tool_use_id === "toolu_0") block.content = [image];
    if (block.tool_use_id === "toolu_1") block.content.push(image);
    return JSON.stringify(entry);
  });
  writeFileSync(transcript, lines.join("\n"));
  resume();
  const cleared = readFileSync(transcript, "utf8").split("\n");

  const shot = resultSent(cleared, "toolu_0");
  const shotPath = /saved at (\S+\.png) \(/.exec(shot)?.[1] ?? "";
  expect(readFileSync(join(workspaceDir, shotPath))).toEqual(png);

  const both = resultSent(cleared, "toolu_1");
  const files = /these files \(relative to your working directory\): ([^;]+);/
    .exec(both)?.[1]
    ?.split(", ");
  expect(files?.map((f) => f.split(".").pop())).toEqual(["txt", "png"]);
  expect(readFileSync(join(workspaceDir, files?.[0] ?? ""), "utf8")).toBe(
    payload("mail1", 19_000),
  );
  expect(readFileSync(join(workspaceDir, files?.[1] ?? ""))).toEqual(png);
});

test("a resume says how many tokens its clearing took off, and nothing once done", () => {
  writeFileSync(transcript, chat(10).join("\n"));
  const first = resumed();
  const lines = readFileSync(transcript, "utf8").split("\n");
  const stubChars = [0, 1, 2, 3, 4, 5, 6]
    .map((i) => resultSent(lines, `toolu_${i}`).length)
    .reduce((a, b) => a + b, 0);
  expect(first?.clearedTokens).toBe(Math.floor((7 * 19_000 - stubChars) / 4));
  expect(resumed()?.clearedTokens).toBe(0);
});

test("a cleared capped result points at the full result it was cut from", () => {
  const target = { workspaceDir, conversationId: "c1" };
  const full = (i: number) => payload(`mail${i}`, 42_000);
  const saved = new Map<string, string>();
  const lines = chat(10).map((line) => {
    const entry = JSON.parse(line);
    const block = entry.message?.content?.[0];
    if (block?.type !== "tool_result") return line;
    const i = Number(block.tool_use_id.split("_")[1]);
    const path = spillToolResult(target, "integration_execute", full(i));
    saved.set(block.tool_use_id, path);
    block.content = [{ type: "text", text: cappedResultText(full(i), path) }];
    return JSON.stringify(entry);
  });
  writeFileSync(transcript, lines.join("\n"));
  resume();
  const cleared = readFileSync(transcript, "utf8").split("\n");

  // Six 20k heads make the batch.
  for (let i = 0; i <= 5; i++) {
    expect(resultSent(cleared, `toolu_${i}`)).toBe(
      `[Cleared tool result: integration_execute, 42,000 characters. It was removed from the conversation to save space. The full result is saved at ${saved.get(`toolu_${i}`)} (relative to your working directory); read that file if you need it again.]`,
    );
  }
  // No second copy of the head beside the full results.
  expect(readdirSync(join(workspaceDir, ".tool-results", "c1"))).toHaveLength(
    10,
  );
});
