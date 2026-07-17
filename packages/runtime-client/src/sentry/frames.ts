import { readFileSync } from "node:fs";
import type { Event, StackFrame } from "@sentry/core";

/**
 * Stack-frame post-processing for engine events: trim the reporter's own
 * plumbing frames, then inline the source lines around each remaining frame.
 * Both run as scope event processors (see client.ts), in that order — trimming
 * first means no file reads for frames that are about to be dropped.
 */

/**
 * With synthetic stacks, a bare-string ERROR's stack ends inside the reporter
 * itself (the console wrap, captureLog, the logger's write/capture chain),
 * which would give every log-site event the same misleading top frame.
 * Trailing frames from these files are popped so the innermost frame is the
 * code that actually logged. Filename-based: both production stacks are
 * source-mapped back to the original `.ts` paths (the sidecar's embedded bun
 * sourcemap, the pod's `--enable-source-maps`); an unmapped stack just stays
 * untrimmed.
 */
const REPORTER_FRAME =
  /(?:sentry[/\\](?:client|console-capture))\.(?:m?[jt]s)$|(?:observability[/\\]logging)\.(?:m?[jt]s)$/;

function isReporterFrame(frame: StackFrame): boolean {
  return !!frame.filename && REPORTER_FRAME.test(frame.filename);
}

/** Exception values and thread values both carry an optional stacktrace. */
type StackHolder = { stacktrace?: { frames?: StackFrame[] } };

function stackHolders(event: Event): StackHolder[] {
  return [...(event.exception?.values ?? []), ...(event.threads?.values ?? [])];
}

/** Exported for tests. Mutates and returns the event. */
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

/** Lines of code shown on each side of the failing line (Sentry's default). */
const CONTEXT_LINES = 5;
/** Longer lines are clipped — minified or generated code would bloat events. */
const MAX_LINE_LENGTH = 250;
/** Per-event cap on distinct files read, a guard against absurd stacks. */
const MAX_FILES_PER_EVENT = 20;

/** Only real on-disk sources; node internals and dependencies stay bare. */
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

/**
 * Inline the source around each frame — pre_context / context_line /
 * post_context — the way `@sentry/node`'s ContextLines integration does, so
 * the Sentry UI shows the exact code the error was raised from. Works wherever
 * the mapped source paths exist on disk: managed pods and the self-host image
 * COPY the `packages/*` sources next to the bundles, and dev runs execute the
 * sources directly. The compiled desktop sidecar has no files on disk, so its
 * frames keep file:line only. Read failures leave the frame bare — a crash
 * reporter must never throw.
 */
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
