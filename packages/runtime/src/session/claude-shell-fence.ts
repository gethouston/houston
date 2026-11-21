import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CREDENTIAL_ENV_VARS } from "../backends/claude/credential-env-vars";
import { config } from "../config";
import {
  bashMemoryFencePrefix,
  resolveChildMemoryCap,
} from "./child-memory-fence";

function shellWord(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function claudeShellFenceScript(
  capBytes: number | null,
  toolShell: string | null = null,
): string {
  return [
    "#!/bin/bash",
    "# Written by the Houston runtime (session/child-memory-fence.ts).",
    toolShell !== null
      ? "# Runs the Claude CLI's shell commands as the deployment's tool user."
      : capBytes !== null
        ? "# Runs the Claude CLI's shell commands under a per-process memory cap."
        : "# Runs the Claude CLI's shell commands without its credentials.",
    'if [ "$1" = "-c" ]; then shift; fi',
    ...(capBytes === null ? [] : [bashMemoryFencePrefix(capBytes)]),
    `unset ${CREDENTIAL_ENV_VARS.join(" ")}`,
    toolShell === null
      ? 'exec "$BASH" -c "$1"'
      : `exec ${shellWord(toolShell)} -c "$1"`,
    "",
  ].join("\n");
}

export function claudeShellPrefix(fencePath: string): string {
  return fencePath.includes(" -") ? `${fencePath} -c` : fencePath;
}

export function ensureClaudeShellFence(
  dir: string,
  capBytes: number | null,
  toolShell: string | null = null,
): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "claude-shell-fence");
  writeFileSync(path, claudeShellFenceScript(capBytes, toolShell), "utf8");
  chmodSync(path, 0o755);
  return path;
}

let resolvedFencePath: string | null | undefined;

export function claudeShellFencePath(
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (resolvedFencePath === undefined) {
    const cap = resolveChildMemoryCap();
    resolvedFencePath =
      cap === null && config.toolShell === null && platform !== "linux"
        ? null
        : ensureClaudeShellFence(
            join(config.dataDir, "bin"),
            cap,
            config.toolShell,
          );
  }
  return resolvedFencePath;
}
