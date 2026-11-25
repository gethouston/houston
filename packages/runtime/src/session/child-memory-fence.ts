import { readFileSync } from "node:fs";
import { config } from "../config";

const MiB = 1024 * 1024;

export const CHILD_MEMORY_CAP_FLOOR_BYTES = 256 * MiB;

const CGROUP_V1_UNLIMITED_BYTES = 2 ** 62;

export const CGROUP_MEMORY_LIMIT_FILES = [
  "/sys/fs/cgroup/memory.max",
  "/sys/fs/cgroup/memory/memory.limit_in_bytes",
] as const;

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

export function childMemoryCapBytes(
  limitBytes: number | null,
  reserveBytes: number,
): number | null {
  if (limitBytes === null) return null;
  return Math.max(CHILD_MEMORY_CAP_FLOOR_BYTES, limitBytes - reserveBytes);
}

// WHY: Pod OOM kills the whole container; RLIMIT_DATA fails just the script, quietly. ADR-0012
export function bashMemoryFencePrefix(capBytes: number): string {
  return `ulimit -d ${Math.floor(capBytes / 1024)} 2>/dev/null`;
}

let resolvedCap: number | null | undefined;

export function resolveChildMemoryCap(): number | null {
  if (resolvedCap === undefined)
    resolvedCap = childMemoryCapBytes(
      readCgroupMemoryLimit(),
      config.engineMemoryReserveBytes,
    );
  return resolvedCap;
}
