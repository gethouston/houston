import { createWriteStream } from "node:fs";
import { rename, truncate } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  UPLOAD_CHUNK_GRANULE_BYTES,
  UPLOAD_NO_308_HEADER,
  UPLOAD_STATUS_OVERRIDE_HEADER,
} from "@houston/wire-types";
import { json } from "../routes/http";
import type { LocalUploadSessions } from "./local";

function incomplete(
  req: IncomingMessage,
  res: ServerResponse,
  size: number,
): void {
  const no308 = req.headers[UPLOAD_NO_308_HEADER.toLowerCase()] === "yes";
  if (size > 0) res.setHeader("Range", `bytes=0-${size - 1}`);
  if (no308) res.setHeader(UPLOAD_STATUS_OVERRIDE_HEADER, "308");
  res.writeHead(no308 ? 200 : 308);
  res.end();
}

export async function serveUploadSink(
  sessions: LocalUploadSessions | undefined,
  id: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const meta = await sessions?.meta(id);
  if (!sessions || !meta) return json(res, 404, { error: "not found" });
  const handled = await sessions.exclusive(id, async () => {
    const current = await sessions.offset(id);
    if (!current.complete && current.size === meta.size) {
      await rename(sessions.path(id, "part"), sessions.path(id, "done"));
      current.complete = true;
    }
    const header = String(req.headers["content-range"] ?? "");
    const status = /^bytes \*\/(\d+)$/.exec(header);
    const chunk = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header);
    if (status && Number(status[1]) === meta.size) {
      req.resume();
      if (current.complete) json(res, 200, { uploadId: id, size: meta.size });
      else incomplete(req, res, current.size);
      return;
    }
    if (!chunk) return json(res, 400, { error: "invalid Content-Range" });
    const start = Number(chunk[1]);
    const end = Number(chunk[2]);
    const total = Number(chunk[3]);
    if (
      total !== meta.size ||
      end < start ||
      end >= total ||
      (end + 1 < total && (end - start + 1) % UPLOAD_CHUNK_GRANULE_BYTES !== 0)
    ) {
      req.resume();
      return json(res, 400, { error: "invalid upload range" });
    }
    if (start !== current.size || current.complete) {
      req.resume();
      return incomplete(req, res, current.size);
    }
    let received = 0;
    const length = end - start + 1;
    const limit = new Transform({
      transform(bytes: Buffer, _encoding, callback) {
        received += bytes.length;
        if (received > length) callback(new Error("upload body exceeds range"));
        else callback(null, bytes);
      },
    });
    try {
      // Pipeline backpressure bounds memory independently of the request's size.
      await pipeline(
        req,
        limit,
        createWriteStream(sessions.path(id, "part"), { flags: "a" }),
      );
    } catch (error) {
      if (received > length) {
        // Earlier pieces of the oversized body already landed; drop them all.
        await truncate(sessions.path(id, "part"), start);
        return json(res, 400, { error: "upload body exceeds range" });
      }
      if (!isDroppedConnection(error)) throw error;
      // The bytes that landed stay; the client's status query reads them.
      if (!res.destroyed && !res.headersSent)
        incomplete(req, res, (await sessions.offset(id)).size);
      return;
    }
    const persisted = await sessions.offset(id);
    if (persisted.size === meta.size) {
      await rename(sessions.path(id, "part"), sessions.path(id, "done"));
      json(res, 200, { uploadId: id, size: meta.size });
    } else incomplete(req, res, persisted.size);
  });
  if (handled === null)
    json(res, 429, { error: "upload in progress" }, { "Retry-After": "1" });
}

function isDroppedConnection(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return (
    code === "ERR_STREAM_PREMATURE_CLOSE" ||
    code === "ECONNRESET" ||
    code === "ECONNABORTED"
  );
}
