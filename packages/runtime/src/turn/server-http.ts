import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gunzipSync } from "node:zlib";

/** The per-turn server's request plumbing: authorization, the incarnation
 *  bind, bounded JSON bodies and JSON answers. */

export function authorized(req: IncomingMessage, token: string): boolean {
  if (!token) return true;
  const header = req.headers["x-internal-token"];
  if (typeof header !== "string") return false;
  const got = Buffer.from(header);
  const want = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Bind a dispatched turn to THIS pod incarnation. The X-Internal-Token is stable
 * per ordinal, so a replacement pod reusing this ordinal+IP would otherwise
 * accept a turn the gateway minted for the PRIOR incarnation. The gateway sends
 * the trusted k8s UID (from the pod_workers stamp) as X-Pool-Pod-UID; a pod
 * refuses any UID that is not its own downward-API UID. This can only reject,
 * never admit, so a tenant that reads its own UID gains nothing. A single-use
 * pod fails closed — a missing header is refused, since the Critical-2 dispatcher
 * always sends it and the deploy gate guarantees it precedes single-use pods.
 * `podUid` empty (off-cluster / per-agent worker) disables the check.
 */
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
  // A dispatcher far from this worker gzips a turn that carries prefetched
  // files; the cap then bounds the inflated JSON too.
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
