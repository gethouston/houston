import type { IncomingMessage } from "node:http";

/**
 * Default cap for control-plane JSON routes. A few MB is orders of magnitude
 * beyond any settings / message / credential payload, yet keeps a hostile or
 * runaway body from ever being buffered whole into the process. Upload routes
 * pass a larger, explicit cap (files-import.ts `MAX_UPLOAD_BODY_BYTES`).
 */
export const MAX_JSON_BYTES = 4 * 1024 * 1024;

/**
 * A request body exceeded its byte cap. Carries the 413 status so the server's
 * top-level handler (and every route) maps it to a clean "Payload Too Large"
 * without leaking parser internals.
 */
export class BodyTooLargeError extends Error {
  readonly status = 413;
  constructor(public readonly maxBytes: number) {
    super("request body exceeds the size limit");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Drain a request body into a Buffer, enforcing `maxBytes` WHILE streaming so an
 * oversized (or slow-loris) body is never buffered whole — the OOM guard the old
 * post-hoc size checks could not give. A declared Content-Length over the cap is
 * rejected up front (cheap, and lets a legitimate over-limit client get a clean
 * 413 before any body is read). But the running-total check is the real guard:
 * Content-Length is client-controlled and absent on chunked bodies. Crossing the
 * cap throws out of the async iteration, which destroys the request stream — no
 * further bytes are read into memory.
 */
export async function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const declared = Number(req.headers?.["content-length"]);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new BodyTooLargeError(maxBytes);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    const chunk = c as Buffer;
    total += chunk.length;
    if (total > maxBytes) throw new BodyTooLargeError(maxBytes);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Parse a JSON request body under a hard byte cap (default `MAX_JSON_BYTES`;
 * upload routes pass the larger transport cap). An empty body reads as `{}`.
 */
export async function readJson(
  req: IncomingMessage,
  maxBytes: number = MAX_JSON_BYTES,
): Promise<Record<string, unknown>> {
  const raw = (await readBody(req, maxBytes)).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}
