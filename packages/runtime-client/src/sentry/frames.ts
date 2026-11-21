import { readFileSync } from "node:fs";
import type { Event, StackFrame } from "@sentry/core";

const REPORTER_FRAME =
  /(?:sentry[/\\](?:client|console-capture))\.(?:m?[jt]s)$|(?:observability[/\\]logging)\.(?:m?[jt]s)$/;

function isReporterFrame(frame: StackFrame): boolean {
  return !!frame.filename && REPORTER_FRAME.test(frame.filename);
}

type StackHolder = { stacktrace?: { frames?: StackFrame[] } };

export function stackHolders(event: Event): StackHolder[] {
  return [...(event.exception?.values ?? []), ...(event.threads?.values ?? [])];
}

export function trimReporterFrames<E extends Event>(event: E): E {
  for (const holder of stackHolders(event)) {
    const frames = holder.stacktrace?.frames;
    if (!frames) continue;
    let last = frames[frames.length - 1];
    while (frames.length > 1 && last && isReporterFrame(last)) {
      frames.pop();
      last = frames[frames.length - 1];
    }
  }
  return event;
}

const CONTEXT_LINES = 5;
const MAX_LINE_LENGTH = 250;
const MAX_FILES_PER_EVENT = 20;

function isReadableAppFrame(frame: StackFrame): boolean {
  const file = frame.filename;
  return (
    !!file &&
    !!frame.lineno &&
    (file.startsWith("/") || /^[A-Za-z]:[/\\]/.test(file)) &&
    !file.includes("node_modules") &&
    /\.(?:m?[jt]sx?|cjs)$/.test(file)
  );
}

function clip(line: string): string {
  return line.length > MAX_LINE_LENGTH
    ? `${line.slice(0, MAX_LINE_LENGTH)} {snip}`
    : line;
}

export function addSourceContext<E extends Event>(event: E): E {
  const cache = new Map<string, string[] | undefined>();
  for (const holder of stackHolders(event)) {
    for (const frame of holder.stacktrace?.frames ?? []) {
      if (!isReadableAppFrame(frame)) continue;
      const file = frame.filename as string;
      if (!cache.has(file)) {
        if (cache.size >= MAX_FILES_PER_EVENT) continue;
        try {
          cache.set(file, readFileSync(file, "utf8").split("\n"));
        } catch {
          cache.set(file, undefined);
        }
      }
      const lines = cache.get(file);
      const lineno = frame.lineno as number;
      if (!lines || lineno > lines.length) continue;
      frame.pre_context = lines
        .slice(Math.max(0, lineno - 1 - CONTEXT_LINES), lineno - 1)
        .map(clip);
      frame.context_line = clip(lines[lineno - 1] ?? "");
      frame.post_context = lines
        .slice(lineno, lineno + CONTEXT_LINES)
        .map(clip);
    }
  }
  return event;
}
