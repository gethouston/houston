export const ASSISTANT_UNSERVED_ENV = "HOUSTON_ASSISTANT_UNSERVED";

export const ASSISTANT_UNAVAILABLE_HERE = "operation_unavailable_here";

export function assistantUnservedEnv(
  names: readonly string[],
): Record<string, string> {
  return names.length > 0 ? { [ASSISTANT_UNSERVED_ENV]: names.join(",") } : {};
}

export function readUnservedOperations(
  env: NodeJS.ProcessEnv = process.env,
): ReadonlySet<string> {
  const raw = env[ASSISTANT_UNSERVED_ENV]?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );
}
