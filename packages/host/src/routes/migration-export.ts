import type { ServerResponse } from "node:http";
import { type Zippable, zipSync } from "fflate";
import { MAX_ARCHIVE_BYTES } from "../turn/files-archive";
import type { Vfs } from "../vfs";
import { safeSeedKey } from "./agent-seed";
import { json } from "./http";
import { classifyMigrationPath } from "./migration-scope";

export async function exportMigrationChunk(
  vfs: Vfs,
  root: string,
  requested: string[],
  res: ServerResponse,
): Promise<void> {
  const entries: Zippable = {};
  let total = 0;
  for (const requestedPath of requested) {
    const rel = safeSeedKey(requestedPath);
    const kind = rel ? classifyMigrationPath(rel) : null;
    if (!rel || kind === null)
      return json(res, 400, {
        error: `path outside migration scope: ${requestedPath}`,
      });
    const buf = await vfs.readBytes(`${root}/${rel}`);
    if (buf === null) continue;
    total += buf.length;
    if (total > MAX_ARCHIVE_BYTES)
      return json(res, 413, { error: "requested chunk too large" });
    entries[rel] = [new Uint8Array(buf), { level: kind === "core" ? 6 : 0 }];
  }
  res.writeHead(200, { "Content-Type": "application/zip" });
  res.end(Buffer.from(zipSync(entries)));
}
