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

export type ClaudeWorkerProfile = "single-use" | "multi-turn" | "server";

/** Boot-only seams that keep the worker profile policy unit-testable. */
export interface ClaudeWorkerBootDeps {
  profile: ClaudeWorkerProfile;
  root: string;
  probe?: () => string;
  warm?: (root: string, binary: string) => Promise<void>;
  report: (error: unknown) => void;
}

/** Resolve and stat the SDK platform binary used by pooled workers. */
export function probeClaudeWorkerBinary(
  deps: ClaudeWorkerProbeDeps = {},
): string {
  // Without HOUSTON_CLAUDE_BIN, resolveClaudeCliBinary starts resolution from
  // the SDK module and selects the same platform package the SDK self-resolves
  // at query time. On Node WITH that explicit override, probe/warm intentionally
  // use the override while the SDK still self-resolves because its executable
  // option is Bun-only; that is the sole known resolution skew.
  const binary = (deps.resolveBinary ?? resolveClaudeCliBinary)();
  if (!binary) throw new Error("Claude Agent SDK binary is unavailable");
  const stats = (deps.stat ?? statSync)(binary);
  if (!stats.isFile())
    throw new Error(`Claude Agent SDK binary is not a file: ${binary}`);
  return binary;
}

/** Start the single-use worker's Claude probe and warmup without blocking boot. */
export function startClaudeWorkerBoot(deps: ClaudeWorkerBootDeps): void {
  if (deps.profile !== "single-use") return;
  const probe = deps.probe ?? probeClaudeWorkerBinary;
  let binary: string;
  try {
    binary = probe();
  } catch (error) {
    deps.report(error);
    return;
  }
  const warm = deps.warm ?? warmClaudeWorker;
  void Promise.resolve()
    .then(() => warm(deps.root, binary))
    .catch(deps.report);
}

let warmup: Promise<void> | undefined;

/** Page the Claude binary into the worker cache once, with no credential. */
export function warmClaudeWorker(root: string, binary?: string): Promise<void> {
  warmup ??= runWarmup(root, binary).catch((error) => {
    warmup = undefined;
    throw error;
  });
  return warmup;
}

async function runWarmup(root: string, resolvedBinary?: string): Promise<void> {
  const binary = resolvedBinary ?? probeClaudeWorkerBinary();
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
