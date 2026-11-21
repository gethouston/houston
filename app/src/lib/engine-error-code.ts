export function engineErrorCode(err: unknown): string | undefined {
  const e = err as
    | {
        kind?: unknown;
        code?: unknown;
        body?: { code?: unknown; error?: unknown };
      }
    | null
    | undefined;
  if (typeof e?.kind === "string") return e.kind;
  if (typeof e?.code === "string") return e.code;
  if (typeof e?.body?.code === "string") return e.body.code;
  const nested = (e?.body?.error as { code?: unknown } | undefined)?.code;
  return typeof nested === "string" ? nested : undefined;
}
