import { inspect } from "node:util";

export type LogLevel = "Debug" | "Info" | "Warn" | "Error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  run: string;
  message: unknown | readonly unknown[];
  cause?: unknown;
  spans?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export function formatLogEntry(entry: LogEntry): string {
  const messages = Array.isArray(entry.message)
    ? entry.message
    : [entry.message];
  return [
    ["timestamp", entry.timestamp] as const,
    ["level", entry.level] as const,
    ["run", entry.run] as const,
    ...messages.flatMap((value) =>
      plain(value) ? flatten(value) : ([["message", value]] as const),
    ),
    ...(entry.cause === undefined ? [] : ([["cause", entry.cause]] as const)),
    ...flatten(entry.spans ?? {}),
    ...flatten(entry.annotations ?? {}),
  ]
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(" ");
}

function flatten(
  input: Record<string, unknown>,
  prefix = "",
  seen = new WeakSet<object>(),
): Array<readonly [string, unknown]> {
  if (seen.has(input)) return [[prefix || "value", "[Circular]"]];
  seen.add(input);
  const entries = Object.entries(input);
  if (entries.length === 0 && prefix) return [[prefix, input]];
  return entries.flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return plain(value) ? flatten(value, path, seen) : [[path, value] as const];
  });
}

function plain(input: unknown): input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

function formatValue(input: unknown): string {
  const value =
    typeof input === "string"
      ? input
      : input instanceof Error
        ? (input.stack ?? input.message)
        : inspect(input, { colors: false, compact: true, depth: null });
  return /^[^\s="\\]+$/.test(value) ? value : JSON.stringify(value);
}
