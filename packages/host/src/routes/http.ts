import type { IncomingMessage, ServerResponse } from "node:http";

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

export async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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
