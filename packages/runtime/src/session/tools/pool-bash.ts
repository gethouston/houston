import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";

/**
 * The env allowlist for a POOL worker's bash. A single-use pool pod runs
 * model-directed shell, and pi's built-in bash copies `process.env` into the
 * child by default — which on a pool worker carries operational secrets the
 * TURN's tenant must never read: `HOUSTON_POOL_WORKER_TOKEN` (gateway auth),
 * `HOUSTON_SANDBOX_TOKEN` / store URLs, and any credential in the ambient env.
 * With the sandbox token a prompt-injected agent could call the control plane
 * directly and pull the workspace's real provider tokens (defeating Gate #2).
 *
 * So the pool bash gets a REPLACED env built from `{}` and this allowlist —
 * the same posture the Claude backend already uses (`claude-env.ts`). Only the
 * non-secret process bootstrap survives: PATH/HOME/shell, locale, temp dirs.
 * The turn's own provider credential lives in the hydrated `auth.json` on disk,
 * not in env; reading it is the tenant reading its own credential on a pod that
 * is destroyed after this one turn, which is acceptable (see the single-use
 * design). Infra secrets are what must not leak, and this closes that.
 */
const BASH_PASSTHROUGH_ENV: readonly string[] = [
  "PATH",
  "HOME",
  "SHELL",
  "USER",
  "LOGNAME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TMPDIR",
  "TMP",
  "TEMP",
];

/** Build the scrubbed child env from an allowlist over `process.env`. */
export function poolBashEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const allow = new Set(BASH_PASSTHROUGH_ENV);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && allow.has(key)) env[key] = value;
  }
  return env;
}

/**
 * A `bash` tool whose child process env is scrubbed to the allowlist above.
 * Registered as a custom tool under the name `bash`, so it SHADOWS pi's
 * built-in bash by name (the same shadow-by-name mechanism the clamped file
 * tools use). Use this on any runtime where bash runs model-directed code with
 * infra secrets in the ambient env — the single-use pool worker.
 */
export function makePoolBashTool(cwd: string) {
  return createBashToolDefinition(cwd, {
    spawnHook: (context) => ({ ...context, env: poolBashEnv() }),
  });
}
