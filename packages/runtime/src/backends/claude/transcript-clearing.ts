import { randomUUID } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { atomicTempPath } from "@houston/protocol";
import {
  clearedStub,
  IMAGE_CHARS,
  staleResultIds,
  stubbedChars,
  type ToolResultRef,
} from "../../session/tool-results/clearing";
import {
  type SpillTarget,
  spillToolResult,
} from "../../session/tool-results/spill";

/**
 * Stale tool-result clearing on the Claude backend
 * (session/tool-results/clearing.ts), applied to the CLI's own transcript.
 *
 * Each turn resumes the CLI from its transcript JSONL, and the request it
 * sends is rebuilt from that file, so a result replaced there is a result the
 * model is no longer sent (checked against the CLI: the resumed request
 * carries the stub). The CLI only clears old results itself behind a
 * server-side flag, after an hour idle. Rewritten between turns, while no CLI
 * runs on it; a result cleared once stays a stub, which is what keeps the
 * prompt cache warm until the next batch.
 */

/** Houston's MCP tools reach the model as `mcp__houston__<tool>`. */
const MCP_PREFIX = /^mcp__houston__/;

interface Block {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  tool_use_id?: unknown;
  content?: unknown;
  text?: unknown;
}

interface Entry {
  type?: unknown;
  isSidechain?: unknown;
  message?: { id?: unknown; content?: unknown };
}

export function clearStaleTranscriptResults(
  transcript: string,
  spill: SpillTarget,
): void {
  const lines = readFileSync(transcript, "utf8").split("\n");
  const entries = new Map<number, Entry>();
  lines.forEach((line, i) => {
    if (line.includes('"tool_use"') || line.includes('"tool_result"'))
      entries.set(i, JSON.parse(line) as Entry);
  });

  const calls = new Map<string, { round: number; name: string }>();
  const rounds = new Map<unknown, number>();
  const results: { line: number; block: Block; ref: ToolResultRef }[] = [];
  for (const [line, entry] of entries) {
    if (entry.isSidechain === true) continue;
    const blocks = Array.isArray(entry.message?.content)
      ? (entry.message.content as Block[])
      : [];
    for (const block of blocks) {
      if (entry.type === "assistant" && block.type === "tool_use") {
        // The CLI writes one entry per content block, so a round is a message id.
        const key = entry.message?.id ?? line;
        if (!rounds.has(key)) rounds.set(key, rounds.size);
        const name = String(block.name).replace(MCP_PREFIX, "");
        calls.set(String(block.id), { round: rounds.get(key) ?? 0, name });
      } else if (entry.type === "user" && block.type === "tool_result") {
        const call = calls.get(String(block.tool_use_id));
        if (!call) continue;
        const { text, images } = contentOf(block.content);
        const chars = stubbedChars(text) ?? text.length + images * IMAGE_CHARS;
        results.push({
          line,
          block,
          ref: { id: String(block.tool_use_id), round: call.round, chars },
        });
      }
    }
  }

  const stale = staleResultIds(
    results.map((r) => r.ref),
    rounds.size,
  );
  const dirty = new Set<number>();
  for (const { line, block, ref } of results) {
    if (!stale.has(ref.id)) continue;
    const { text } = contentOf(block.content);
    if (stubbedChars(text) !== undefined) continue;
    const name = calls.get(ref.id)?.name ?? "tool";
    block.content = clearedStub(
      name,
      ref.chars,
      spillToolResult(spill, name, text),
    );
    dirty.add(line);
  }
  if (dirty.size === 0) return;
  for (const line of dirty) lines[line] = JSON.stringify(entries.get(line));
  const tmp = atomicTempPath(transcript, randomUUID());
  writeFileSync(tmp, lines.join("\n"));
  renameSync(tmp, transcript);
}

/** A tool_result's content: a string, or text and image blocks. */
function contentOf(content: unknown): { text: string; images: number } {
  if (typeof content === "string") return { text: content, images: 0 };
  if (!Array.isArray(content)) return { text: "", images: 0 };
  const blocks = content as Block[];
  return {
    text: blocks
      .filter((b) => b.type === "text")
      .map((b) => String(b.text))
      .join("\n"),
    images: blocks.filter((b) => b.type === "image").length,
  };
}
