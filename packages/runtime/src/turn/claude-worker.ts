import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveClaudeCliBinary } from "../auth/anthropic-cli-binary";
import { buildClaudeEnv } from "../backends/claude/claude-env";

/** Replaceable filesystem seams for the worker binary probe. */
export interface ClaudeWorkerProbeDeps {
  resolveBinary?: () => string | null;
  stat?: (path: string) => { isFile(): boolean };
}

/** Resolve and stat the SDK platform binary used by pooled workers. */
export function probeClaudeWorkerBinary(
  deps: ClaudeWorkerProbeDeps = {},
): string {
  const binary = (deps.resolveBinary ?? resolveClaudeCliBinary)();
  if (!binary) throw new Error("Claude Agent SDK binary is unavailable");
  const stats = (deps.stat ?? statSync)(binary);
  if (!stats.isFile())
    throw new Error(`Claude Agent SDK binary is not a file: ${binary}`);
  return binary;
}

let warmup: Promise<void> | undefined;

/** Page the Claude binary into the worker cache once, with no credential. */
export function warmClaudeWorker(root: string): Promise<void> {
  warmup ??= runWarmup(root).catch((error) => {
    warmup = undefined;
    throw error;
  });
  return warmup;
}

async function runWarmup(root: string): Promise<void> {
  const binary = probeClaudeWorkerBinary();
  const warmDir = join(root, "claude-warm");
  await mkdir(warmDir, { recursive: true });
  const env = buildClaudeEnv(undefined, {
    configDir: warmDir,
    homeDir: warmDir,
  });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ["--version"], { env, stdio: "ignore" });
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Claude Agent SDK binary warmup timed out"));
    }, 10_000);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Claude Agent SDK binary warmup exited with ${signal ?? code}`,
          ),
        );
    });
  });
}
