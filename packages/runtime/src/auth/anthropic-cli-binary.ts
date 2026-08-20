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
  // Every probe failure is collected and logged on the null path: a null here
  // silently downgrades the connect to the token paste flow, and a silent
  // downgrade is undebuggable from the field (beta policy: we want the noise).
  const probes: string[] = [];
  try {
    const sidecarSibling = resolveClaudeExecutable();
    if (sidecarSibling) return sidecarSibling;
    probes.push("not a Bun sidecar (Node runtime)");
  } catch (e) {
    // Bun-compiled but the sibling is missing/placeholder: turns already fail
    // loud there (binary-path throws its typed error); the LOGIN just degrades
    // to the paste flow instead of refusing to start.
    logNoCliBinary([`sidecar sibling unusable: ${(e as Error).message}`]);
    return null;
  }
  const name = process.platform === "win32" ? "claude.exe" : "claude";
  const slug = `${process.platform}-${process.arch === "arm64" ? "arm64" : "x64"}`;
  const resolve = deps?.resolve ?? sdkScopedResolve;
  const exists = deps?.exists ?? existsSync;
  const pkg = `@anthropic-ai/claude-agent-sdk-${slug}`;
  for (const spec of [`${pkg}/${name}`, `${pkg}/package.json`]) {
    try {
      const hit = resolve(spec);
      const bin = hit.endsWith(name) ? hit : join(dirname(hit), name);
      if (exists(bin)) return bin;
      probes.push(`${spec} resolved but ${bin} does not exist`);
    } catch (e) {
      // Not resolvable via this spec (package "exports" differences between
      // SDK versions) — try the next, else fall through to null.
      probes.push(`${spec}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  logNoCliBinary(probes);
  return null;
}

/** The one line that explains a paste-flow downgrade in pod/self-host logs. */
function logNoCliBinary(probes: string[]): void {
  console.warn(
    `[oauth:anthropic] no runnable Claude CLI here — the connect will use the token paste flow (${probes.join(" | ")})`,
  );
}

/**
 * Resolve `spec` from the SDK's own directory, in two hops. The per-platform
 * binary package is a dependency of `@anthropic-ai/claude-agent-sdk`, NOT of
 * the runtime — under pnpm's isolated node_modules a require anchored HERE
 * cannot see it (MODULE_NOT_FOUND), which made this resolver return null on
 * every Node deployment and silently dumped web/pod logins into the paste
 * flow. Anchor at the SDK's resolved main export instead (its `exports` map
 * blocks resolving `@anthropic-ai/claude-agent-sdk/package.json` directly);
 * from there the platform package resolves exactly the way the SDK itself
 * finds its binary at turn time.
 */
function sdkScopedResolve(spec: string): string {
  const here = createRequire(import.meta.url);
  const sdkMain = here.resolve("@anthropic-ai/claude-agent-sdk");
  return createRequire(sdkMain).resolve(spec);
}

/** Spawn the real CLI login child (`anthropic-cli-login.ts`'s production seam). */
export function spawnCli(binary: string, configDir: string): LoginChild {
  return spawn(binary, ["auth", "login", "--claudeai"], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    stdio: ["pipe", "pipe", "pipe"],
  }) as unknown as LoginChild;
}
