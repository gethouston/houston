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
      const { size } = await file.stat();
      if (size > maxBytes) throw new VfsReadLimitError();
      // The cap is a limit, not an allocation: size the first read from stat,
      // then keep reading (a file growing after stat) until EOF or past the cap.
      const chunks: Buffer[] = [];
      let length = 0;
      let next = size + 1;
      while (length <= maxBytes) {
        const chunk = Buffer.alloc(Math.min(next, maxBytes + 1 - length));
        const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
        if (bytesRead === 0) break;
        chunks.push(chunk.subarray(0, bytesRead));
        length += bytesRead;
        next = 64 * 1024;
      }
      if (length > maxBytes) throw new VfsReadLimitError();
      return chunks.length === 1
        ? (chunks[0] as Buffer)
        : Buffer.concat(chunks, length);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
}
