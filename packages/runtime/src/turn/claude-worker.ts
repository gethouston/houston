import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveClaudeCliBinary } from "../auth/anthropic-cli-binary";
import { buildClaudeEnv } from "../backends/claude/claude-env";
import { preloadTurnModules } from "./turn-module-preload";

export interface ClaudeWorkerProbeDeps {
  resolveBinary?: () => string | null;
  stat?: (path: string) => { isFile(): boolean };
}

export type ClaudeWorkerProfile = "single-use" | "multi-turn" | "server";

export interface ClaudeWorkerBootDeps {
  profile: ClaudeWorkerProfile;
  root: string;
  probe?: () => string;
  preload?: () => Promise<void>;
  warm?: (root: string, binary: string) => Promise<void>;
  report: (error: unknown) => void;
}

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

export function startClaudeWorkerBoot(deps: ClaudeWorkerBootDeps): void {
  if (deps.profile === "server") return;
  void (deps.preload ?? preloadTurnModules)().catch(deps.report);
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
