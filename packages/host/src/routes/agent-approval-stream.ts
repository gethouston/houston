import type { ServerResponse } from "node:http";
import { StringDecoder } from "node:string_decoder";
import { substituteApprovals } from "../assistant/approval-presentation";
import { assistantApprovals } from "../assistant/approvals";

export function mayCarryQuestion(text: string): boolean {
  return text.includes('"question"') || text.includes("\\u");
}

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
    if (!mayCarryQuestion(text)) return text;
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
