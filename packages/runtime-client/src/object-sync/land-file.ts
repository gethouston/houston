import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename, rm } from "node:fs/promises";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { atomicTempPath } from "@houston/protocol";
import { landingMode, mkdirForLanding } from "./private-paths";

export async function landStream(
  open: () => Readable,
  destFile: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!(await mkdirForLanding(destFile))) return false;
  const tempFile = atomicTempPath(destFile, randomUUID());
  try {
    await pipeline(
      open(),
      createWriteStream(tempFile, { ...landingMode(destFile), flags: "wx" }),
      ...(signal ? [{ signal }] : []),
    );
    await rename(tempFile, destFile);
  } catch (error) {
    await rm(tempFile, { force: true });
    throw error;
  }
  return true;
}
