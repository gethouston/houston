import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { ClaudeBackendUnavailableError } from "./backend";

/**
 * Resolve the spawnable `claude` executable for the Claude Agent SDK, but ONLY
 * when the default resolution can't work — inside the Bun-compiled desktop
 * sidecar.
 *
 * On Node (dev, tests, the Docker self-host / engine-pod / per-turn images) the
 * SDK resolves its own native binary via `require.resolve` of the per-platform
 * `@anthropic-ai/claude-agent-sdk-<platform>-<arch>` subpackage, so we return
 * `undefined` and let it — never override a working path.
 *
 * Under `bun build --compile` (the desktop `host-sidecar`) that resolution
 * CANNOT work: the SDK's modules live in Bun's `$bunfs` virtual filesystem, and
 * `require.resolve` can't reach the on-disk subpackage from there (the SDK's own
 * README documents this sharp edge). `scripts/build-host-sidecar.sh` therefore
 * stages the platform `claude` binary NEXT TO the compiled sidecar executable
 * (both are Tauri externalBins → they land in the same bundle directory, e.g.
 * `Contents/MacOS/` on macOS), and this helper points the SDK at that sibling.
 * Shipping it as a sibling file (rather than embedding it in `$bunfs` and
 * extracting to a temp dir at runtime) keeps it a real Mach-O in the bundle that
 * the macOS signing/notarization sweep signs like every other bundled binary.
 */
export interface ResolveClaudeExecutableDeps {
  /** `import.meta.url` of the running module (Bun-compiled → a `$bunfs` URL). */
  moduleUrl?: string;
  /** `process.execPath` — the on-disk path of the running executable. */
  execPath?: string;
  /** `process.platform` (drives the binary filename: `claude` vs `claude.exe`). */
  platform?: NodeJS.Platform;
  /** Filesystem existence probe (injected for tests). */
  exists?: (path: string) => boolean;
}

/**
 * True when this module is running inside a `bun build --compile` single-file
 * executable. Bun serves the bundled modules from `/$bunfs/` (POSIX) or a
 * `~BUN` root (Windows), so `import.meta.url` reflects it — matching the same
 * detection the SDK's own `extractFromBunfs` uses.
 */
export function isBunCompiled(moduleUrl: string = import.meta.url): boolean {
  return moduleUrl.includes("$bunfs") || moduleUrl.includes("~BUN");
}

/**
 * The Claude Code executable path to pass as `options.pathToClaudeCodeExecutable`,
 * or `undefined` on the Node path (let the SDK self-resolve). Throws a typed
 * `ClaudeBackendUnavailableError` when running Bun-compiled but the sibling
 * binary is missing — a build that shipped the sidecar without staging `claude`.
 */
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
  return sibling;
}
