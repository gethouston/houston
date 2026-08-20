import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { resolveClaudeExecutable } from "../backends/claude/binary-path";
import type { LoginChild } from "./anthropic-cli-output";

/**
 * Resolve a spawnable Claude Code CLI for THIS runtime, or null when none can
 * run here (the anthropic login then uses the token paste flow). Probes, in
 * order:
 *
 *   1. the `HOUSTON_CLAUDE_BIN` dev/test override (verbatim, mirroring the
 *      desktop shell's `claude_login/resolve.rs`),
 *   2. the Bun-compiled desktop sidecar's staged sibling binary,
 *   3. on Node (engine pods, self-host, dev) the SDK's per-platform package —
 *      the exact binary the SDK itself spawns for turns, so wherever turns can
 *      run, the login can too.
 */
export function resolveClaudeCliBinary(deps?: {
  resolve?: (spec: string) => string;
  exists?: (path: string) => boolean;
}): string | null {
  const override = process.env.HOUSTON_CLAUDE_BIN;
  if (override) return override;
  try {
    const sidecarSibling = resolveClaudeExecutable();
    if (sidecarSibling) return sidecarSibling;
  } catch {
    // Bun-compiled but the sibling is missing/placeholder: turns already fail
    // loud there (binary-path throws its typed error); the LOGIN just degrades
    // to the paste flow instead of refusing to start.
    return null;
  }
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  const slug = `${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;
  const resolve = deps?.resolve ?? createRequire(import.meta.url).resolve;
  const exists = deps?.exists ?? existsSync;
  const pkg = `@anthropic-ai/claude-agent-sdk-${slug}`;
  for (const spec of [`${pkg}/${name}`, `${pkg}/package.json`]) {
    try {
      const hit = resolve(spec);
      const bin = hit.endsWith(name) ? hit : join(dirname(hit), name);
      if (exists(bin)) return bin;
    } catch {
      // Not resolvable via this spec (package "exports" differences between
      // SDK versions) — try the next, else fall through to null.
    }
  }
  return null;
}

/** Spawn the real CLI login child (`anthropic-cli-login.ts`'s production seam). */
export function spawnCli(binary: string, configDir: string): LoginChild {
  return spawn(binary, ["auth", "login", "--claudeai"], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    stdio: ["pipe", "pipe", "pipe"],
  }) as unknown as LoginChild;
}
