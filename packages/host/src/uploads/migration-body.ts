import type { IncomingMessage } from "node:http";
import { migrationImportCommitSchema } from "@houston/wire-types";
import { readJson } from "../routes/http";
import type { StagedFile, StagedUploads } from "./commit";

/** Body reader with a hard cap — a runaway upload dies at the boundary. */
export async function migrationBody(
  req: IncomingMessage,
  maxBytes: number,
  uploads?: StagedUploads,
): Promise<{ bytes: Buffer; staged?: StagedFile } | null> {
  if (req.headers["content-type"]?.includes("application/json")) {
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new MigrationBodyError("invalid migration upload");
      throw error;
    }
    const parsed = migrationImportCommitSchema.safeParse(body);
    if (!parsed.success)
      throw new MigrationBodyError("invalid migration upload");
    if (!uploads) throw new MigrationBodyError("uploads not configured");
    const staged = await uploads.prepare(parsed.data);
    const bytes = await staged.read();
    return bytes.length > maxBytes ? null : { bytes, staged };
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes: Buffer = chunk;
    total += bytes.length;
    if (total > maxBytes) return null;
    chunks.push(bytes);
  }
  return { bytes: Buffer.concat(chunks) };
}
export class MigrationBodyError extends Error {
  readonly status = 400;
}
