/**
 * The machine-readable reason an engine call refused, wherever the host put it.
 *
 * Every surface that treats a rejection as an expected, explainable STATE
 * (a taken file name, a team that needs an upgrade, an invite to someone who is
 * already a member) has to identify that state, and the status cannot: the day
 * a route grows a second 409, every client keyed on `409` starts explaining the
 * new one with the old one's copy. The English message cannot either — the
 * host's wording is not a contract, and it is not translated.
 *
 * The shapes are the ones Houston's hosts actually send: the TS host's
 * `{ error, code }` body, the Go gateway's flat `{ code }`, and the adapter's
 * own `kind`.
 */
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
