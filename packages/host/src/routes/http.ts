import type { IncomingMessage, ServerResponse } from "node:http";

// The single, byte-capped body reader — shared so the cap can't drift between
// the many routes that import `readJson` from here.
export { readBody, readJson } from "./read-body";

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
