import { open, readFile } from "node:fs/promises";
import { VfsReadLimitError } from "./vfs";

export async function readBytes(
  path: string,
  maxBytes?: number,
): Promise<Buffer | null> {
  try {
    if (maxBytes === undefined) return await readFile(path);
    const file = await open(path, "r");
    try {
      if ((await file.stat()).size > maxBytes) throw new VfsReadLimitError();
      // The extra byte detects a file growing after stat without an unbounded read.
      const bytes = Buffer.alloc(maxBytes + 1);
      let length = 0;
      while (length < bytes.length) {
        const { bytesRead } = await file.read(
          bytes,
          length,
          bytes.length - length,
          null,
        );
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      if (length > maxBytes) throw new VfsReadLimitError();
      return bytes.subarray(0, length);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}
