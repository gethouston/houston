import { randomUUID } from "node:crypto";
import {
  closeSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  type FileEntry,
  parseSessionEntries,
  type SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { ATOMIC_TMP_SUFFIX } from "@houston/protocol";

/** Reclaim summarized history only when it saves a material store transfer. */
export const SESSION_LOG_ROTATION_BYTES = 8 * 1024 * 1024;

/** Leave the archived file untouched, including pi's newline/version repairs. */
export function rotateSessionLog(file: string, workspaceDir: string): string {
  const size = statSync(file).size;
  if (size <= SESSION_LOG_ROTATION_BYTES) return file;
  // Match pi's chunked reader without its newline repair of the archived file.
  const fileEntries: FileEntry[] = [];
  const descriptor = openSync(file, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let pending = "";
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      pending += decoder.write(buffer.subarray(0, bytes));
      let start = 0;
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        fileEntries.push(...parseSessionEntries(pending.slice(start, newline)));
        start = newline + 1;
        newline = pending.indexOf("\n", start);
      }
      pending = pending.slice(start);
    }
    fileEntries.push(...parseSessionEntries(pending + decoder.end()));
  } finally {
    closeSync(descriptor);
  }
  const manager = SessionManager.inMemory(workspaceDir, undefined, fileEntries);
  const header = manager.getHeader();
  const compaction = manager
    .getBranch()
    .findLast((entry) => entry.type === "compaction");
  if (!header || !compaction) return file;
  const entries = manager.getEntries();
  const compactionAt = entries.findIndex((e) => e.id === compaction.id);
  const keptAt = entries.findIndex((e) => e.id === compaction.firstKeptEntryId);
  const start = keptAt >= 0 && keptAt < compactionAt ? keptAt : compactionAt;
  const prefix = entries.slice(0, start);
  const live = entries.slice(start);
  const keep = new Set<string>();

  // Context settings use the last assistant's model. Virtual selection also
  // consults the last physical response and the preceding model_change.
  const assistantById = new Map<string, string | undefined>();
  const physicalById = new Map<string, string | undefined>();
  for (const entry of prefix) {
    switch (entry.type) {
      case "thinking_level_change":
      case "model_change":
      case "custom":
      case "label":
      case "session_info":
        keep.add(entry.id);
        break;
      case "message":
      case "compaction":
      case "branch_summary":
      case "custom_message":
      case "context_edit":
      case "usage":
        break;
      default: {
        const exhaustive: never = entry;
        throw new Error(`Unknown pi session entry: ${exhaustive}`);
      }
    }

    const assistant =
      entry.type === "message" && entry.message.role === "assistant"
        ? entry.message
        : undefined;
    assistantById.set(
      entry.id,
      assistant ? entry.id : assistantById.get(entry.parentId ?? ""),
    );
    physicalById.set(
      entry.id,
      assistant && assistant.api !== "pi-virtual"
        ? entry.id
        : physicalById.get(entry.parentId ?? ""),
    );
  }
  for (const entry of live) {
    for (const index of [assistantById, physicalById]) {
      const id = index.get(entry.parentId ?? "");
      if (id) keep.add(id);
    }
  }

  // Resolve omitted ancestry without changing live IDs or internal edges.
  const parentById = new Map<string, string | null>();
  const retained: SessionEntry[] = [];
  for (const [index, entry] of entries.entries()) {
    const parentId = entry.parentId
      ? (parentById.get(entry.parentId) ?? null)
      : null;
    if (index < start && !keep.has(entry.id)) {
      parentById.set(entry.id, parentId);
      continue;
    }
    parentById.set(entry.id, entry.id);
    retained.push(
      index < start &&
        entry.type === "message" &&
        entry.message.role === "assistant"
        ? { ...entry, parentId, message: { ...entry.message, content: [] } }
        : { ...entry, parentId },
    );
  }
  const content = `${[header, ...retained].map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  // Count only bytes actually omitted, so even large carried state is idempotent.
  if (size - Buffer.byteLength(content) <= SESSION_LOG_ROTATION_BYTES)
    return file;

  // A hydrated filename can be ahead of this worker's clock. Advance it too,
  // so filename-based resume always chooses the successor, even in that case.
  const previousTimestamp = readdirSync(dirname(file))
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .at(-1)
    ?.split("_", 1)[0]
    ?.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
  const previousTime = Date.parse(previousTimestamp ?? "");
  const timestamp = new Date(
    Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0),
  )
    .toISOString()
    .replace(/[:.]/g, "-");
  const successor = join(
    dirname(file),
    `${timestamp}_${manager.getSessionId()}.jsonl`,
  );
  const temporary = `${successor}.${randomUUID()}${ATOMIC_TMP_SUFFIX}`;
  writeFileSync(temporary, content, { flag: "wx" });
  renameSync(temporary, successor);
  return successor;
}
