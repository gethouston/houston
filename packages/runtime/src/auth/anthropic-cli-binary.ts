import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { resolveClaudeExecutable } from "../backends/claude/binary-path";
import type { LoginChild } from "./anthropic-cli-output";

export function resolveClaudeCliBinary(deps?: {
  resolve?: (spec: string) => string;
  exists?: (path: string) => boolean;
}): string | null {
  const override = process.env.HOUSTON_CLAUDE_BIN;
  if (override) return override;
  const probes: string[] = [];
  try {
    const sidecarSibling = resolveClaudeExecutable();
    if (sidecarSibling) return sidecarSibling;
    probes.push("not a Bun sidecar (Node runtime)");
  } catch (e) {
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
      probes.push(`${spec}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  logNoCliBinary(probes);
  return null;
}

function logNoCliBinary(probes: string[]): void {
  console.warn(
    `[oauth:anthropic] no runnable Claude CLI here — the connect will use the token paste flow (${probes.join(" | ")})`,
  );
}

// WHY: The SDK exports map blocks resolving its package.json; anchor at the main export. ADR-0008
function sdkScopedResolve(spec: string): string {
  const here = createRequire(import.meta.url);
  const sdkMain = here.resolve("@anthropic-ai/claude-agent-sdk");
  return createRequire(sdkMain).resolve(spec);
}

// WHY: auth login uses plain readline so pipes work; setup-token is an Ink TUI needing a real TTY. ADR-0008
export function spawnCli(binary: string, configDir: string): LoginChild {
  return spawn(binary, ["auth", "login", "--claudeai"], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: configDir },
    stdio: ["pipe", "pipe", "pipe"],
  }) as unknown as LoginChild;
}
