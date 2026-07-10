/**
 * Small HTTP helpers shared by every Agent Store route handler: a JSON response
 * builder, a size-capped JSON body reader, and a Postgres unique-violation guard.
 * Kept framework-neutral (plain `Response`) so handlers stay thin and uniform.
 */

/** Reject obviously-oversized payloads before parsing (defense, not a hard wall).
 *  256 KB is generous for an AgentIR — descriptions cap at 20k, skills at 200k. */
export const MAX_BODY_BYTES = 256 * 1024;

/** Build a JSON `Response`. Extra headers may override the default content-type. */
export function json(
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export type JsonBodyResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; status: number; body: { error: string } };

/**
 * Read the request body as a JSON object, enforcing the size cap first. Returns a
 * discriminated result so callers surface the exact error status (413/400) without
 * their own try/catch.
 */
export async function readJsonObject(
  request: Request,
): Promise<JsonBodyResult> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { ok: false, status: 413, body: { error: "payload_too_large" } };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, body: { error: "invalid_json" } };
  }
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, status: 413, body: { error: "payload_too_large" } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, body: { error: "invalid_json" } };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, body: { error: "invalid_json" } };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/** Detect a Postgres unique-violation (SQLSTATE 23505) however it bubbles up. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Run an operation that may lose a race for a unique key, retrying up to
 * `attempts` times on a Postgres unique-violation. Each retry re-runs `op` from
 * scratch — so a read-then-insert of `max+1` re-reads the now-committed peer and
 * converges. On success the operation's value is returned; once the bound is
 * exhausted a `{ ok: false }` marker is returned so the caller maps it to a
 * conflict status instead of surfacing a raw 23505 as an unhandled 500. Any
 * non-unique error propagates unchanged — genuine failures are never swallowed.
 */
export async function withUniqueViolationRetry<T>(
  op: () => Promise<T>,
  attempts = 3,
): Promise<{ ok: true; value: T } | { ok: false }> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return { ok: true, value: await op() };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      if (attempt === attempts - 1) return { ok: false };
    }
  }
  // Only reachable when attempts < 1: report exhausted, never succeed blindly.
  return { ok: false };
}
