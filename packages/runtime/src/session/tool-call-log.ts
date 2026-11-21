import type { AgentToolResult } from "@earendil-works/pi-coding-agent";

interface FailedDetails {
  ok: false;
  error?: { code?: unknown };
}

function operationOf(details: unknown): string | undefined {
  if (typeof details !== "object" || details === null) return undefined;
  const { operation } = details as { operation?: unknown };
  return typeof operation === "string" ? operation : undefined;
}

function outcomeOf(details: unknown): string {
  if (typeof details !== "object" || details === null) return "ok";
  const failed = details as FailedDetails;
  if (failed.ok !== false) return "ok";
  const code = failed.error?.code;
  return `error ${typeof code === "string" ? code : "unknown"}`;
}

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

interface LoggableTool {
  name: string;
  execute: (...args: never[]) => Promise<AgentToolResult<unknown>>;
}

export function withToolCallLog<T extends LoggableTool>(tool: T): T {
  return {
    ...tool,
    execute: (...args: never[]) =>
      loggedToolCall(tool.name, () => tool.execute(...args)),
  } as T;
}
