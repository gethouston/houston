import type { IncomingMessage, ServerResponse } from "node:http";

// The single, byte-capped body reader — shared so the cap can't drift between
// the many routes that import `readJson` from here.
export { readBody, readJson } from "./read-body";

/** An optional trimmed string body field: whitespace-only and non-strings
 *  become undefined — never a real (empty) value with different semantics. */
export function optionalTrimmed(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(buf);
}

/**
 * The blanket refusal a family gives for a method it does not serve. One
 * spelling, because the dispatcher emits this exact body when a family's
 * `methodMismatch` is "405" (routes/registry/index.ts): a handler whose own
 * 405 drifted from it would answer differently depending on which of the two
 * reached the request first.
 */
export function methodNotAllowed(res: ServerResponse): void {
  json(res, 405, { error: "method not allowed" });
}

/** The caller's bearer, from the Authorization header or a ?token= fallback (SSE). */
export function bearer(req: IncomingMessage, url: URL): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice("Bearer ".length);
  return url.searchParams.get("token");
}

/** One request header by (lowercase) name, or undefined; arrays collapse to the first. */
export function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
