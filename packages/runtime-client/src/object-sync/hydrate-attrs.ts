import { chmod, stat } from "node:fs/promises";
import { fileSha256 } from "./file-hash";
import type { HydrateEntry } from "./hydrate-download";
import { contentHash, withExecute } from "./object-attrs";
import { privateDirOf } from "./private-paths";

export async function landedHash(
  dest: string,
  size: number,
  entry: Pick<HydrateEntry, "executable">,
): Promise<string> {
  const sha = await fileSha256(dest, size);
  if (!entry.executable || privateDirOf(dest)) return contentHash(sha, false);
  await chmod(dest, withExecute((await stat(dest)).mode));
  return contentHash(sha, true);
}
