import { execFile } from "node:child_process";
import { resolveClaudeExecutable } from "./binary-path";
import { buildClaudeEnv } from "./claude-env";
import { claudeLoginConfigDir } from "./paths";

export type ProbeAnswer =
  | { known: true; loggedIn: boolean }
  | { known: false; reason: string };

function claudeBinary(): string {
  try {
    return resolveClaudeExecutable() ?? "claude";
  } catch {
    return "claude";
  }
}

export function readProbeOutcome(
  err: (Error & { killed?: boolean; signal?: NodeJS.Signals | null }) | null,
  stdout: string,
): ProbeAnswer {
  if (err?.killed || err?.signal) {
    return {
      known: false,
      reason: `probe killed (${err.signal ?? "timeout"})`,
    };
  }
  if (!stdout.trim())
    return { known: false, reason: "probe produced no output" };
  let parsed: { loggedIn?: unknown };
  try {
    parsed = JSON.parse(stdout) as { loggedIn?: unknown };
  } catch {
    return { known: false, reason: "probe output was not JSON" };
  }
  if (typeof parsed.loggedIn !== "boolean") {
    return { known: false, reason: "no boolean `loggedIn` in output" };
  }
  return { known: true, loggedIn: parsed.loggedIn };
}

// WHY: Built without a token: an ambient ANTHROPIC_API_KEY would answer for another credential. ADR-0009
export function spawnStatusProbe(): Promise<ProbeAnswer> {
  const env = buildClaudeEnv(undefined, {
    configDir: claudeLoginConfigDir(),
  });
  return new Promise<ProbeAnswer>((resolve, reject) => {
    execFile(
      claudeBinary(),
      ["auth", "status", "--json"],
      { env, timeout: 10_000 },
      (err, stdout) => {
        if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
          reject(err);
          return;
        }
        resolve(readProbeOutcome(err, stdout));
      },
    );
  });
}

export function spawnClaudeLogout(): Promise<void> {
  const env = buildClaudeEnv(undefined, {
    configDir: claudeLoginConfigDir(),
  });
  return new Promise<void>((resolve, reject) => {
    execFile(
      claudeBinary(),
      ["auth", "logout"],
      { env, timeout: 10_000 },
      (err) => {
        if (err && (err as NodeJS.ErrnoException).code !== "ENOENT") {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });
}
