import type { ServerResponse } from "node:http";
import { StringDecoder } from "node:string_decoder";
import { substituteApprovals } from "../assistant/approval-presentation";
import { assistantApprovals } from "../assistant/approvals";

/**
 * Response adapter at the shell boundary: every byte the runtime writes for a
 * conversation read is re-serialized through {@link substituteApprovals}, so an
 * approval card's text and options are always the HOST's record and never the
 * runtime's prose. Covers both shapes the runtime answers with — a buffered
 * JSON history and the live SSE stream.
 *
 * Bodies that are not JSON carry no interaction step, so they pass through
 * untouched rather than failing the read.
 */
export function approvalResponse(
  res: ServerResponse,
  agentId: string,
  conversationId: string,
): ServerResponse {
  const decoder = new StringDecoder("utf8");
  let buffered = "";
  const isStream = () =>
    String(res.getHeader("content-type")).startsWith("text/event-stream");
  const rewrite = (text: string): string => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return text;
    }
    return JSON.stringify(
      substituteApprovals(parsed, assistantApprovals, agentId, conversationId),
    );
  };

  /** One SSE frame's lines, rebuilt with its `data:` payload substituted. */
  const rewriteFrame = (frame: string): string => {
    const lines = frame.split(/\r?\n/);
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""));
    if (!data.length) return `${frame}\n\n`;
    const metadata = lines.filter(
      (line) => line.length > 0 && !line.startsWith("data:"),
    );
    return `${[...metadata, `data: ${rewrite(data.join("\n"))}`].join("\n")}\n\n`;
  };

  const write = (chunk: Uint8Array | string): boolean => {
    buffered +=
      typeof chunk === "string" ? chunk : decoder.write(Buffer.from(chunk));
    // A buffered body is rewritten whole at `end`: until then nothing may reach
    // the client, or a card would be half-substituted.
    if (!isStream()) return true;
    let ready = true;
    let match = /\r?\n\r?\n/.exec(buffered);
    while (match) {
      const frame = buffered.slice(0, match.index);
      buffered = buffered.slice(match.index + match[0].length);
      ready = res.write(rewriteFrame(frame)) && ready;
      match = /\r?\n\r?\n/.exec(buffered);
    }
    return ready;
  };

  const end = (chunk?: Uint8Array | string) => {
    if (chunk !== undefined) write(chunk);
    buffered += decoder.end();
    // A stream cut mid-frame: the remainder is dropped, never flushed raw — an
    // unterminated frame is one the substitution never got to inspect.
    if (isStream()) return res.end();
    return res.end(buffered ? rewrite(buffered) : undefined);
  };

  return new Proxy(res, {
    get(target, property) {
      if (property === "write") return write;
      if (property === "end") return end;
      const member: unknown = Reflect.get(target, property, target);
      return typeof member === "function" ? member.bind(target) : member;
    },
  });
}
