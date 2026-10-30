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
  type SpillImage,
  type SpillTarget,
  spillToolResultParts,
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
  source?: { type?: unknown; media_type?: unknown; data?: unknown };
}

interface Entry {
  type?: unknown;
  isSidechain?: unknown;
  message?: { id?: unknown; content?: unknown };
}

/**
 * Returns the tokens the next request no longer carries, counted at four
 * characters a token: an undercount for dense payloads, so a fill reduced by
 * it errs toward compacting, never toward overflowing.
 */
export function clearStaleTranscriptResults(
  transcript: string,
  spill: SpillTarget,
): number {
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
        const chars =
          stubbedChars(text) ?? text.length + images.length * IMAGE_CHARS;
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
  let freedChars = 0;
  for (const { line, block, ref } of results) {
    if (!stale.has(ref.id)) continue;
    const { text, images } = contentOf(block.content);
    if (stubbedChars(text) !== undefined) continue;
    const name = calls.get(ref.id)?.name ?? "tool";
    const stub = clearedStub(
      name,
      ref.chars,
      spillToolResultParts(spill, name, text, images),
    );
    block.content = stub;
    freedChars += Math.max(0, ref.chars - stub.length);
    dirty.add(line);
  }
  if (dirty.size === 0) return 0;
  for (const line of dirty) lines[line] = JSON.stringify(entries.get(line));
  const tmp = atomicTempPath(transcript, randomUUID());
  writeFileSync(tmp, lines.join("\n"));
  renameSync(tmp, transcript);
  return Math.floor(freedChars / 4);
}

/** A tool_result's content: a string, or text and (base64) image blocks. */
function contentOf(content: unknown): { text: string; images: SpillImage[] } {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: "", images: [] };
  const blocks = content as Block[];
  return {
    text: blocks
      .filter((b) => b.type === "text")
      .map((b) => String(b.text))
      .join("\n"),
    images: blocks.flatMap((b) =>
      b.type === "image" &&
      b.source?.type === "base64" &&
      typeof b.source.data === "string"
        ? [{ data: b.source.data, mimeType: String(b.source.media_type) }]
        : [],
    ),
  };
}
