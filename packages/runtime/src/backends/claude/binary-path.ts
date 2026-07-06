import { closeSync, existsSync, openSync, readSync } from "node:fs";
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
  /**
   * Read the first few bytes of a file (injected for tests). Used to tell a real
   * native `claude` binary from the `build.rs` dev placeholder that is staged in
   * its place when the real one is absent — see `looksLikePlaceholder`.
   */
  readHead?: (path: string) => string;
}

/** Read the first `n` bytes of a file as latin1, without loading the whole file. */
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

/**
 * True when the file at `path` is the `build.rs` externalBin PLACEHOLDER rather
 * than the real native `claude` binary. When the ~232 MB SDK binary isn't staged
 * (a local/dev bundle built without `scripts/build-host-sidecar.sh`), `build.rs`
 * writes a tiny stub script in its place so Tauri's bundler is satisfied. Handing
 * THAT to the SDK as `claude` is catastrophic: the historic stub `sleep`s
 * forever, so every Claude turn hangs on "mission in progress" with no output and
 * no error. A real `claude` is a Mach-O / ELF / PE image whose first bytes are
 * binary magic; the placeholder is a POSIX shell script (`#!`) or a Windows batch
 * file (`@echo`). Detect that shape and refuse it so the turn fails LOUD (a typed
 * error the UI can surface) instead of hanging silently.
 */
export function looksLikePlaceholder(
  path: string,
  readHead: (path: string) => string = readHeadBytes,
): boolean {
  let head: string;
  try {
    head = readHead(path);
  } catch {
    // Unreadable → let the caller treat it as usable; a spawn failure there is a
    // loud, distinct error, not this silent-hang case.
    return false;
  }
  return head.startsWith("#!") || head.startsWith("@echo");
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
 * binary is missing OR is the `build.rs` placeholder stub — a build that shipped
 * the sidecar without staging the real `claude`. Failing here turns a silent
 * forever-hang (SDK spawns the stub) into a loud, surfaced turn error.
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
  // A present-but-placeholder sibling is WORSE than a missing one: the SDK would
  // spawn it and the historic stub `sleep`s forever, hanging every turn with no
  // output. Refuse it here so the turn fails loud instead (see looksLikePlaceholder).
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
