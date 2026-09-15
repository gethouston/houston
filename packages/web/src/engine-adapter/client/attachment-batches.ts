/**
 * The browser half of an upload: turning dropped `File`s into the JSON frames
 * the host stores, in batches small enough to send.
 *
 * It stays in the web adapter because `File` and `webkitRelativePath` are DOM
 * types — `@houston/sdk` is deployment-agnostic and an embedded iOS runtime has
 * neither — while the requests themselves live in `sdk.files`. The split is
 * also what keeps memory flat: a batch is framed only when it is about to be
 * sent, so a 2 GB folder drop never holds more than one batch of base64 at once.
 *
 * Shared by composer attachments and the Files section's own upload (HOU-889),
 * which is why the plan and the framing live beside each other rather than in
 * either caller.
 */

import type { FileUpload } from "@houston/sdk";

// A folder can hold hundreds of small files; a request per file would turn one
// drop into hundreds of round trips. Batch small files together up to a modest
// byte budget, well under the host's per-request cap, and give anything larger
// than the budget its own request (the client's per-file limit already bounds
// it to the host cap). Requests stay sequential so per-file host-side dedupe
// never races itself.
const BATCH_BUDGET_BYTES = 8 * 1024 * 1024;
const BATCH_MAX_FILES = 25;

export function planAttachmentBatches(files: readonly File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let currentBytes = 0;
  for (const f of files) {
    const fits =
      current.length < BATCH_MAX_FILES &&
      currentBytes + f.size <= BATCH_BUDGET_BYTES;
    if (current.length > 0 && !fits) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(f);
    currentBytes += f.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * The upload-relative path for a folder-derived file, or undefined for a plain
 * file. Normalized to forward slashes with no leading slash; a value without a
 * `/` carries no structure and is treated as plain. Shared by composer
 * attachments and the Files section's folder upload (HOU-889).
 */
function uploadRelPath(f: File): string | undefined {
  const raw = f.webkitRelativePath;
  if (!raw) return undefined;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.includes("/") ? normalized : undefined;
}

/** Base64-encode bytes without blowing the call stack on large files (chunked btoa). */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** One batch as the host's upload frames: name, base64 bytes, folder path. */
export async function frameBatch(
  batch: readonly File[],
): Promise<FileUpload[]> {
  return Promise.all(
    batch.map(async (f) => ({
      name: f.name,
      contentBase64: bytesToBase64(new Uint8Array(await f.arrayBuffer())),
      relPath: uploadRelPath(f),
    })),
  );
}
