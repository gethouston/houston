import type { IncomingMessage } from "node:http";

export const MAX_JSON_BYTES = 4 * 1024 * 1024;

export class BodyTooLargeError extends Error {
  readonly status = 413;
  constructor(public readonly maxBytes: number) {
    super("request body exceeds the size limit");
    this.name = "BodyTooLargeError";
  }
}

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

export async function readJson(
  req: IncomingMessage,
  maxBytes: number = MAX_JSON_BYTES,
): Promise<Record<string, unknown>> {
  const raw = (await readBody(req, maxBytes)).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
}
