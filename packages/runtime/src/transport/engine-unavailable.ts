import type { RouteContext } from "./http-helpers";

export function engineUnavailable(
  ctx: RouteContext,
  detail: string,
  retryAfterSeconds: number,
): void {
  ctx.res.writeHead(503, {
    "Content-Type": "application/json; charset=utf-8",
    "Retry-After": String(retryAfterSeconds),
  });
  ctx.res.end(JSON.stringify({ error: "engine unavailable", detail }));
}
