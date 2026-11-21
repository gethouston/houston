import { join, posix } from "node:path";
import type { ObjectStore } from "@houston/runtime-client/object-sync";
import {
  readClaudeConfigFlags,
  readClaudeFlagCacheFile,
  sameClaudeFlags,
  seedClaudeConfigFlags,
  writeClaudeFlagCacheFile,
} from "../backends/claude/flag-cache";
import { CLAUDE_FLAGS_DIR, claudeFlagsFileName } from "./claude-flags-path";
import { turnClaudeLayout } from "./turn-backend";

const warn = (what: string) => (reason: string) =>
  console.warn(`[claude-flags] ${what}: ${reason}`);

const UPLOAD_DEADLINE_MS = 5_000;

export function seedTurnClaudeFlags(input: {
  dataDir: string;
  configDir: string;
  userId: string | undefined;
}): void {
  if (!input.userId) return;
  const stored = readClaudeFlagCacheFile(
    join(input.dataDir, CLAUDE_FLAGS_DIR, claudeFlagsFileName(input.userId)),
    warn("ignoring the stored flag cache"),
  );
  if (!stored) return;
  try {
    seedClaudeConfigFlags(input.configDir, stored);
  } catch (error) {
    warn("could not seed the flag cache")(
      error instanceof Error ? error.message : String(error),
    );
  }
}

export async function persistTurnClaudeFlags(input: {
  store: ObjectStore;
  prefix: string;
  filesystem: { dataDir: string; dataRel: string };
  root: string;
  conversationId: string;
  userId: string | undefined;
  deadlineMs?: number;
}): Promise<void> {
  if (!input.userId) return;
  const { dataDir, dataRel } = input.filesystem;
  const fresh = readClaudeConfigFlags(
    turnClaudeLayout(input.root, dataDir, input.conversationId).configDir,
    warn("unreadable Claude config"),
  );
  if (!fresh) return;
  const name = claudeFlagsFileName(input.userId);
  const stored = readClaudeFlagCacheFile(
    join(dataDir, CLAUDE_FLAGS_DIR, name),
    () => {},
  );
  if (stored && sameClaudeFlags(stored, fresh)) return;
  const rel = posix.join(dataRel, CLAUDE_FLAGS_DIR, name);
  try {
    const staged = join(input.root, `claude-flags-${name}`);
    writeClaudeFlagCacheFile(staged, fresh);
    const deadline = AbortSignal.timeout(
      input.deadlineMs ?? UPLOAD_DEADLINE_MS,
    );
    await Promise.race([
      input.store.upload(
        staged,
        input.prefix ? posix.join(input.prefix, rel) : rel,
        { signal: deadline },
      ),
      new Promise<never>((_resolve, reject) =>
        deadline.addEventListener("abort", () => reject(deadline.reason), {
          once: true,
        }),
      ),
    ]);
  } catch (error) {
    warn("could not store the flag cache")(
      error instanceof Error ? error.message : String(error),
    );
  }
}
