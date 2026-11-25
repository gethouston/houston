import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { dirname, join } from "node:path";
import { ClaudeBackendUnavailableError } from "./sdk-loader";

export interface ResolveClaudeExecutableDeps {
  moduleUrl?: string;
  execPath?: string;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
  readHead?: (path: string) => string;
}

function readHeadBytes(path: string, n = 8): string {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(n);
    const read = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read).toString("latin1");
  } finally {
    closeSync(fd);
  }
}

export function looksLikePlaceholder(
  path: string,
  readHead: (path: string) => string = readHeadBytes,
): boolean {
  let head: string;
  try {
    head = readHead(path);
  } catch {
    return false;
  }
  return head.startsWith("#!") || head.startsWith("@echo");
}

export function isBunCompiled(moduleUrl: string = import.meta.url): boolean {
  return moduleUrl.includes("$bunfs") || moduleUrl.includes("~BUN");
}

// WHY: Bun's $bunfs hides the SDK platform package; a staged sibling also gets notarized. ADR-0009
export function resolveClaudeExecutable(
  deps: ResolveClaudeExecutableDeps = {},
): string | undefined {
  const moduleUrl = deps.moduleUrl ?? import.meta.url;
  if (!isBunCompiled(moduleUrl)) return undefined;

  const execPath = deps.execPath ?? process.execPath;
  const platform = deps.platform ?? process.platform;
  const exists = deps.exists ?? existsSync;

  const binaryName = platform === "win32" ? "claude.exe" : "claude";
  const sibling = join(dirname(execPath), binaryName);
  if (!exists(sibling)) {
    throw new ClaudeBackendUnavailableError(
      new Error(
        `Claude Code binary not found next to the sidecar (expected ${sibling}). ` +
          "The host-sidecar build must stage it via scripts/build-host-sidecar.sh.",
      ),
    );
  }
  if (looksLikePlaceholder(sibling, deps.readHead)) {
    throw new ClaudeBackendUnavailableError(
      new Error(
        `Claude Code binary at ${sibling} is a build placeholder, not the real ` +
          "binary. This bundle was built without staging it — run " +
          "scripts/build-host-sidecar.sh (release CI does this automatically).",
      ),
    );
  }
  return sibling;
}
