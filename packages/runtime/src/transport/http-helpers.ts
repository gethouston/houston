import type { IncomingMessage, ServerResponse } from "node:http";
import { config } from "../config";

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  path: string;
  method: string;
}

export function routeContext(
  req: IncomingMessage,
  res: ServerResponse,
): RouteContext {
  const url = new URL(req.url || "/", `http://${config.host}:${config.port}`);
  return {
    req,
    res,
    url,
    path: url.pathname,
    method: req.method || "GET",
  };
}

export function json(res: ServerResponse, status: number, body: unknown) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(buf);
}

export async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
}

export function authorized(ctx: RouteContext): boolean {
  if (!config.token) return true;
  if (ctx.req.headers.authorization === `Bearer ${config.token}`) return true;
  return ctx.url.searchParams.get("token") === config.token;
}
