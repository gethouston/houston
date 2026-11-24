import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { atomicTempPath } from "@houston/protocol";
import { objectStoreResponseError } from "./http-store-errors";
import type {
  BatchReadEntry,
  BatchReadOutcome,
  ReadOptions,
} from "./object-store";
import { withOperationSignal } from "./operation-signal";
import { landingMode, mkdirForLanding } from "./private-paths";

type BatchPost = (init: RequestInit) => Promise<Response>;

interface BatchFrameHeader {
  key: string;
  status: number;
  size: number;
  generation?: string;
  link?: boolean;
}

/** POST the keys and land the framed answer. A GET-shaped read: retry-safe. */
export async function downloadHttpBatch(
  post: BatchPost,
  authHeaders: Record<string, string>,
  entries: BatchReadEntry[],
  opts?: ReadOptions,
): Promise<Map<string, BatchReadOutcome>> {
  return withOperationSignal(opts?.signal, async (signal) => {
    const response = await post({
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ keys: entries.map(({ key }) => key) }),
      signal,
    });
    return landHttpBatch(response, entries, signal);
  });
}

/**
 * Land one `POST …/batch` response. The body is a run of frames in request
 * order: a u32 big-endian header length, the header JSON, then `size` bytes.
 * A store without the route (404/405) answers every key `fallback`.
 */
export async function landHttpBatch(
  response: Response,
  entries: BatchReadEntry[],
  signal?: AbortSignal,
): Promise<Map<string, BatchReadOutcome>> {
  const outcomes = new Map<string, BatchReadOutcome>();
  if (response.status === 404 || response.status === 405) {
    for (const { key } of entries) outcomes.set(key, { status: "fallback" });
    return outcomes;
  }
  if (!response.ok) {
    throw await objectStoreResponseError(response, "POST", "batch");
  }
  const body = Buffer.from(await response.arrayBuffer());
  const destByKey = new Map(entries.map((entry) => [entry.key, entry]));
  let offset = 0;
  while (offset < body.length) {
    if (signal?.aborted) throw signal.reason;
    const headerLength = body.readUInt32BE(offset);
    offset += 4;
    const header = JSON.parse(
      body.subarray(offset, offset + headerLength).toString("utf8"),
    ) as BatchFrameHeader;
    offset += headerLength;
    const content = body.subarray(offset, offset + header.size);
    offset += header.size;
    const entry = destByKey.get(header.key);
    if (!entry) throw new Error(`object store batch returned ${header.key}`);
    if (header.status === 200 && header.link === true) {
      outcomes.set(header.key, { status: "fallback" });
    } else if (header.status === 200) {
      if (!(await writeAtomically(entry.destFile, content))) {
        outcomes.set(header.key, { status: "refused" });
        continue;
      }
      outcomes.set(header.key, {
        status: "ok",
        ...(header.generation && header.generation !== "0"
          ? { generation: header.generation }
          : {}),
      });
    } else if (header.status === 404) {
      outcomes.set(header.key, { status: "missing" });
    } else {
      outcomes.set(header.key, { status: "fallback" });
    }
  }
  for (const { key } of entries) {
    if (!outcomes.has(key)) outcomes.set(key, { status: "fallback" });
  }
  return outcomes;
}

/** Land `content` at `destFile`; false when its private directory was refused. */
export async function writeAtomically(
  destFile: string,
  content: Buffer,
): Promise<boolean> {
  if (!(await mkdirForLanding(destFile))) return false;
  const tempFile = atomicTempPath(destFile, randomUUID());
  try {
    // "wx": never through a file or symlink already at the temp path.
    await writeFile(tempFile, content, {
      ...landingMode(destFile),
      flag: "wx",
    });
    await rename(tempFile, destFile);
  } catch (error) {
    await rm(tempFile, { force: true });
    throw error;
  }
  return true;
}
