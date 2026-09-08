import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

/**
 * ONE line in `runtime.log` per tool call: which tool, how long it took, and how
 * it ended.
 *
 * Written because the record of what the assistant actually DID was missing. A
 * user was told Houston cannot delete a mission while the operation that
 * deletes one sat in the catalog, and the log could not say whether the model
 * had searched, called anything, or been refused - so the incident had to be
 * reconstructed from the chat. A tool call is the assistant's only way to touch
 * the user's data, so it is the event worth recording.
 *
 * INFO, not DEBUG: this is the ordinary, expected trace of a working assistant,
 * and it is what the next incident will be read from. A failure keeps its
 * NAMED code (`needs_confirmation`, `agent_not_found`), because every tool here
 * reports failures as values rather than throws - the code is the whole
 * diagnosis, and dropping it would leave a line that says only "something went
 * wrong".
 *
 * Both backends run every Houston tool through this: the pi path wraps the tool
 * objects it registers (session/session-tools.ts) and the Claude path wraps
 * each bridged MCP handler (backends/claude/mcp-tool-adapter.ts). One place, so
 * a turn is logged identically whichever provider served it.
 */

/** The `details` shape every Houston tool reports a refusal in. */
interface FailedDetails {
  ok: false;
  error?: { code?: unknown };
}

/** The operation a dispatcher tool acted on, when its details name one. */
function operationOf(details: unknown): string | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const { operation } = details as { operation?: unknown };
  return typeof operation === "string" ? operation : undefined;
}

/** `ok`, or `error <code>` when the tool refused with a named code. */
function outcomeOf(details: unknown): string {
  if (typeof details !== "object" || details === null) return "ok";
  const failed = details as FailedDetails;
  if (failed.ok !== false) return "ok";
  const code = failed.error?.code;
  return `error ${typeof code === "string" ? code : "unknown"}`;
}

/** The record itself, so both wrappers compose exactly the same line. */
function record(name: string, startedAt: number, result: unknown): void {
  const details =
    typeof result === "object" && result !== null
      ? (result as { details?: unknown }).details
      : undefined;
  const operation = operationOf(details);
  console.info(
    `[tool] ${name}${operation ? ` ${operation}` : ""} ${Math.round(Date.now() - startedAt)}ms ${outcomeOf(details)}`,
  );
}

/**
 * Run one tool call and log it. A throw is logged too and then rethrown
 * untouched: the caller's error handling is the contract, and a tool that dies
 * is the single most important line in the file.
 */
export async function loggedToolCall<T>(
  name: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await run();
    record(name, startedAt, result);
    return result;
  } catch (err) {
    console.info(
      `[tool] ${name} ${Date.now() - startedAt}ms error ${err instanceof Error ? err.name : "throw"}`,
    );
    throw err;
  }
}

/**
 * The narrowest view of a pi tool this wrapper needs. `never[]` parameters make
 * every concrete `ToolDefinition<S>` assignable without widening what the
 * wrapper may do with the arguments: it only passes them through.
 */
interface LoggableTool {
  name: string;
  execute: (...args: never[]) => Promise<AgentToolResult<unknown>>;
}

/**
 * The same tool, with its call logged. Everything else about the definition
 * (schema, description, render hooks, execution mode) is carried over
 * untouched, so pi and the SDK bridge see the tool they were given.
 */
export function withToolCallLog<T extends LoggableTool>(tool: T): T {
  // SAFETY: the spread reproduces every field of T and replaces `execute` with
  // a function of the identical signature; TypeScript cannot express "T with
  // one method rewrapped" for an unresolved T.
  return {
    ...tool,
    execute: (...args: never[]) =>
      loggedToolCall(tool.name, () => tool.execute(...args)),
  } as T;
}
