import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  bashMemoryFencePrefix,
  resolveChildMemoryCap,
} from "../child-memory-fence";

/**
 * The env allowlist for a model-directed bash child.
 *
 * pi's built-in bash copies `process.env` into the child, and a runtime's
 * environment is operational-secret material on EVERY deployment: the pool
 * worker's `HOUSTON_POOL_WORKER_TOKEN`, and everywhere else
 * `HOUSTON_SANDBOX_TOKEN` plus the control-plane URL it authenticates against.
 * With the sandbox token a prompt-injected agent can call the host directly and
 * pull the workspace's real provider tokens (defeating Gate #2), so one `echo`
 * in a bash tool is the whole exploit — on the desktop as much as in the cloud.
 *
 * So bash gets a REPLACED env built from `{}` and this allowlist — the same
 * posture the Claude backend already applies to its subprocess on every
 * surface (`backends/claude/claude-env.ts`). Only the non-secret process
 * bootstrap survives: PATH/HOME/shell, identity, locale, temp dirs, the Windows
 * process vars a child needs to start at all, and the proxy/custom-CA vars a
 * corporate network needs. The turn's own provider credential lives in
 * `auth.json` on disk, not in env; infra secrets are what must not leak, and
 * this closes that.
 */
const BASH_PASSTHROUGH_ENV: readonly string[] = [
  // POSIX process + shell essentials.
  "PATH",
  "HOME",
  "SHELL",
  // Identity (non-secret).
  "USER",
  "LOGNAME",
  "USERNAME",
  // Locale.
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  // Temp directories.
  "TMPDIR",
  "TMP",
  "TEMP",
  // Windows process bootstrap — a child cannot start without these on native
  // Windows, where the desktop app runs the same runtime code.
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  // Network config (non-secret): proxy routing and an extra CA bundle, so a
  // proxied or private-CA machine can still reach the network from a command.
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "NODE_EXTRA_CA_CERTS",
];

/**
 * Build the scrubbed child env from an allowlist over `process.env`. Compared
 * case-insensitively (Windows env keys vary in case, and the proxy vars are
 * honored in both `HTTP_PROXY` and `http_proxy` forms), preserving each key's
 * original case.
 */
export function scrubbedBashEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const allow = new Set(BASH_PASSTHROUGH_ENV);
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && allow.has(key.toUpperCase())) env[key] = value;
  }
  return env;
}

/**
 * The pi bash options that fence a command's memory: the cap is applied as a
 * command prefix (pi runs `<prefix>\n<command>` in one shell), so the shell
 * and every process it spawns inherit it. No cap → no prefix, byte-identical
 * to the unfenced tool. See child-memory-fence.ts for why.
 */
export function bashMemoryFenceOptions(capBytes: number | null): {
  commandPrefix?: string;
} {
  return capBytes === null
    ? {}
    : { commandPrefix: bashMemoryFencePrefix(capBytes) };
}

/**
 * A `bash` tool whose child process env is scrubbed to the allowlist above,
 * and whose memory is fenced by the container's limit (child-memory-fence.ts;
 * `memoryCapBytes` overrides the resolved cap, null = no fence).
 * Registered as a custom tool under the name `bash`, so it SHADOWS pi's
 * built-in bash by name (the same shadow-by-name mechanism the clamped file
 * tools use). Every runtime that offers bash registers it — the long-lived
 * server (desktop, self-host, standing pods) and the single-use pool worker
 * alike; a shell that can read the host credential is the same hole on all of
 * them.
 */
export function makeScrubbedBashTool(
  cwd: string,
  opts: { memoryCapBytes?: number | null } = {},
) {
  const cap =
    opts.memoryCapBytes === undefined
      ? resolveChildMemoryCap()
      : opts.memoryCapBytes;
  return createBashToolDefinition(cwd, {
    ...bashMemoryFenceOptions(cap),
    spawnHook: (context) => ({ ...context, env: scrubbedBashEnv() }),
  });
}
