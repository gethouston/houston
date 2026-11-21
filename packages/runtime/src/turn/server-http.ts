import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";
export function authorized(req: IncomingMessage, token: string): boolean {
  if (!token) return true;
  const header = req.headers["x-internal-token"];
  if (typeof header !== "string") return false;
  const got = Buffer.from(header);
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

export function incarnationOK(
  req: IncomingMessage,
  podUid: string | undefined,
  singleUse: boolean,
): boolean {
  if (!podUid) return true;
  const header = req.headers["x-pool-pod-uid"];
  if (typeof header !== "string" || header.length === 0) return !singleUse;
  const got = Buffer.from(header);
  const want = Buffer.from(podUid);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function readJson(
  req: IncomingMessage,
  maxBytes: number,
  marks?: Record<string, number>,
): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).byteLength;
    if (size > maxBytes) {
      throw new Error(`request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks);
  if (marks) marks.t_body_received = performance.now();
  const raw =
    req.headers["content-encoding"] === "gzip"
      ? gunzipSync(body, { maxOutputLength: maxBytes })
      : body;
  return JSON.parse(raw.toString("utf8") || "{}");
}

export function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function wireErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  console.error("[turn] non-Error thrown:", error);
  return "internal error";
}
