import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";

/**
 * A memory fence for the processes a model spawns (a bash command, the Claude
 * CLI's Bash tool), sized from the container this runtime lives in.
 *
 * A hosted engine pod is ONE cgroup with a hard memory limit and group OOM
 * kill: when any process in it pushes the sum past the limit, the kernel kills
 * every process in the container — the host, this runtime, the model's shell —
 * and the pod restarts. From the user's chair the turn simply vanishes ("The
 * turn ended unexpectedly"): the exporter script the agent launched grew past
 * ~1 GB in a 2 GiB pod and took the engine down with it (observed 2026-09-09,
 * three restarts in one session).
 *
 * The kernel's only per-process lever inside such a cgroup is a resource limit.
 * `RLIMIT_DATA` (bash `ulimit -d`) caps a process's private writable memory —
 * heap plus anonymous mappings, which is what an interpreter's working set is —
 * and is inherited by everything it spawns. A script that exceeds it fails IN
 * PLACE (Python raises MemoryError, node's Buffer.alloc throws, a runaway heap
 * aborts the one process) and the failure lands in the tool result, where the
 * model can read it and change plan, instead of ending the conversation.
 *
 * The cap is the container's limit minus what the engine itself needs to stay
 * alive ({@link config.engineMemoryReserveBytes}); no container limit (the
 * desktop, a bare VM) means no fence — nothing changes there. `RLIMIT_AS` is
 * deliberately NOT used: it counts reserved-but-uncommitted address space, and
 * a V8 heap reserves gigabytes of it up front.
 */

const MiB = 1024 * 1024;

/**
 * Below this a cap starves ordinary tooling (git, pip, npm) rather than fencing
 * a runaway script — a container that small is not worth fencing.
 */
export const CHILD_MEMORY_CAP_FLOOR_BYTES = 256 * MiB;

/**
 * cgroup v1 reports "no limit" as 2^63 rounded down to a page; anything in that
 * neighbourhood is unlimited, not a real budget.
 */
const CGROUP_V1_UNLIMITED_BYTES = 2 ** 62;

/**
 * Where a container's own memory limit is readable, in preference order: the
 * unified hierarchy (cgroup v2, every current Kubernetes node), then the
 * legacy memory controller. A plain host has neither file at the root.
 */
export const CGROUP_MEMORY_LIMIT_FILES = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
] as const;

/** Parse one cgroup limit file: bytes, or null for "no limit" / unreadable. */
export function parseCgroupMemoryLimit(raw: string | null): number | null {
  if (raw === null) return null;
  const text = raw.trim();
  if (text === "max") return null;
  if (!/^\d+$/.test(text)) return null;
  const bytes = Number(text);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
  if (bytes >= CGROUP_V1_UNLIMITED_BYTES) return null;
  return bytes;
}

/**
 * The container's memory limit in bytes, or null when this process is not in
 * a memory-limited container. Linux only — the cgroup files do not exist
 * elsewhere, and neither does the kill semantics this guards against.
 */
export function readCgroupMemoryLimit(
  read: (path: string) => string | null = readOrNull,
  platform: NodeJS.Platform = process.platform,
): number | null {
  if (platform !== "linux") return null;
  for (const path of CGROUP_MEMORY_LIMIT_FILES) {
    const limit = parseCgroupMemoryLimit(read(path));
    if (limit !== null) return limit;
  }
  return null;
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The per-process cap for a given container limit: the limit minus the engine
 * reserve, never below the floor. Null when there is no limit to derive from.
 */
export function childMemoryCapBytes(
  limitBytes: number | null,
  reserveBytes: number,
): number | null {
  if (limitBytes === null) return null;
  return Math.max(CHILD_MEMORY_CAP_FLOOR_BYTES, limitBytes - reserveBytes);
}

/**
 * The shell line that applies the cap to the current shell and everything it
 * spawns. `ulimit -d` takes 1024-byte blocks. Errors are silenced: a hard limit
 * already below the cap is stricter, not a failure, and the command must run.
 */
export function bashMemoryFencePrefix(capBytes: number): string {
  return `ulimit -d ${Math.floor(capBytes / 1024)} 2>/dev/null`;
}

/**
 * The wrapper the Claude CLI runs its Bash tool through when
 * `CLAUDE_CODE_SHELL_PREFIX` names it: the CLI appends the whole command as
 * ONE argument (verified against Claude Code 2.1), so `$1` is the command and
 * the wrapper re-enters bash under the cap. `$BASH` is the interpreter running
 * this script (always set inside a bash script), the same one the CLI chose.
 */
export function claudeShellFenceScript(capBytes: number): string {
  return [
    "#!/bin/bash",
    "# Written by the Houston runtime (session/child-memory-fence.ts).",
    "# Runs the Claude CLI's shell commands under a per-process memory cap.",
    bashMemoryFencePrefix(capBytes),
    'exec "$BASH" -c "$1"',
    "",
  ].join("\n");
}

/**
 * Write the wrapper for `capBytes` under `dir` and return its absolute path.
 * Rewritten on every call (cheap, and a cap change must never leave a stale
 * script behind); mode 0755 so the CLI's shell can execute it.
 */
export function ensureClaudeShellFence(dir: string, capBytes: number): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "claude-shell-fence");
  writeFileSync(path, claudeShellFenceScript(capBytes), "utf8");
  chmodSync(path, 0o755);
  return path;
}

let resolvedCap: number | null | undefined;
let resolvedFencePath: string | null | undefined;

/**
 * This runtime's cap for model-spawned processes, decided once per process
 * from the container limit and the configured engine reserve. Null outside a
 * memory-limited container.
 */
export function resolveChildMemoryCap(): number | null {
  if (resolvedCap === undefined)
    resolvedCap = childMemoryCapBytes(
      readCgroupMemoryLimit(),
      config.engineMemoryReserveBytes,
    );
  return resolvedCap;
}

/**
 * The absolute path of the Claude CLI shell wrapper for this runtime's cap,
 * written into the runtime's data dir on first use. Null when there is no cap.
 */
export function claudeShellFencePath(): string | null {
  if (resolvedFencePath === undefined) {
    const cap = resolveChildMemoryCap();
    resolvedFencePath =
      cap === null
        ? null
        : ensureClaudeShellFence(join(config.dataDir, "bin"), cap);
  }
  return resolvedFencePath;
}
