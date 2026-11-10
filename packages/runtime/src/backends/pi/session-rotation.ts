import { randomUUID } from "node:crypto";
import { readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type FileEntry,
  parseSessionEntries,
  type SessionEntry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { ATOMIC_TMP_SUFFIX } from "@houston/protocol";
import { installRuntimeLogging } from "../../observability/logging";
import { sessionLogLines } from "./session-log-lines";

/** Reclaim summarized history only when it saves a material store transfer. */
export const SESSION_LOG_ROTATION_BYTES = 8 * 1024 * 1024;

/** Leave the archived file untouched, including pi's newline/version repairs. */
export function rotateSessionLog(file: string, workspaceDir: string): string {
  const size = statSync(file).size;
  if (size <= SESSION_LOG_ROTATION_BYTES) return file;
  // Only rule out certain no-ops; the full branch traversal decides rotation.
  const earlyIds = new Set<string>();
  let couldRotate = false;
  for (const { line, offset } of sessionLogLines(file)) {
    if (offset <= SESSION_LOG_ROTATION_BYTES) {
      // Canonical pi envelopes put id immediately after type. Unrecognized
      // envelopes stay uncertain and go through the full parse.
      const id =
        /^\s*\{\s*"type"\s*:\s*"[^"]+"\s*,\s*"id"\s*:\s*"([A-Za-z0-9_-]+)"/.exec(
          line,
        )?.[1];
      if (id) earlyIds.add(id);
      continue;
    }
    if (!/"type"\s*:\s*"compaction"/.test(line)) continue;
    if (
      parseSessionEntries(line).some(
        (entry) =>
          entry.type === "compaction" && !earlyIds.has(entry.firstKeptEntryId),
      )
    ) {
      couldRotate = true;
      break;
    }
  }
  if (!couldRotate) return file;
  const fileEntries: FileEntry[] = [];
  for (const { line } of sessionLogLines(file))
    fileEntries.push(...parseSessionEntries(line));
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
  const live = entries.slice(start);
  const keep = new Set<string>();

  // Context settings use the last assistant's model. Virtual selection also
  // consults the last physical response and the preceding model_change.
  const assistantById = new Map<string, string | undefined>();
  const physicalById = new Map<string, string | undefined>();
  for (const entry of entries) {
    const entryType = entry.type;
    switch (entry.type) {
      case "thinking_level_change":
      case "model_change":
      case "custom":
      case "label":
      case "session_info":
        keep.add(entry.id);
        break;
      case "message":
        if (entry.message.role === "system") keep.add(entry.id);
        break;
      case "compaction":
      case "branch_summary":
      case "custom_message":
      case "context_edit":
      case "usage":
        break;
      default: {
        const _exhaustive: never = entry;
        // The installed runtime logger sends ERROR to its log and Sentry feed.
        installRuntimeLogging().logger.error(
          new Error(
            `Session log rotation skipped: unknown pi entry type ${entryType}`,
          ),
        );
        return file;
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
  const newest =
    readdirSync(dirname(file))
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .at(-1) ?? "";
  const previousTimestamp = newest
    .split("_", 1)[0]
    ?.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
  const previousTime = Date.parse(previousTimestamp ?? "");
  const timestamp = new Date(
    Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0),
  )
    .toISOString()
    .replace(/[:.]/g, "-");
  const successorName = `${timestamp}_${manager.getSessionId()}.jsonl`;
  if (successorName <= newest) return file;
  const successor = join(dirname(file), successorName);
  const temporary = `${successor}.${randomUUID()}${ATOMIC_TMP_SUFFIX}`;
  writeFileSync(temporary, content, { flag: "wx" });
  renameSync(temporary, successor);
  return successor;
}
