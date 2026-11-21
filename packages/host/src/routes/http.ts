import type { IncomingMessage, ServerResponse } from "node:http";

export { readBody, readJson } from "./read-body";

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

export function methodNotAllowed(res: ServerResponse): void {
  json(res, 405, { error: "method not allowed" });
}

export function bearer(req: IncomingMessage, url: URL): string | null {
  const h = req.headers.authorization;
  if (h?.startsWith("Bearer ")) return h.slice("Bearer ".length);
  return url.searchParams.get("token");
}

export function header(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
