export type CeilingValue =
  | { kind: "all" }
  | { kind: "count"; count: number }
  | null;

export function ceilingValue(
  allowed: string[] | null | undefined,
): CeilingValue {
  if (allowed === undefined) return null;
  return allowed === null
    ? { kind: "all" }
    : { kind: "count", count: allowed.length };
}

export type AccessMode = "any" | "picked";

export function ceilingMode(allowed: string[] | null): AccessMode {
  return allowed === null ? "any" : "picked";
}
