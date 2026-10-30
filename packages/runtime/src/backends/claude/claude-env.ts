import { isAbsolute } from "node:path";
import { firstByteDeadlineMs } from "../../ai/first-byte";
import { config } from "../../config";
import {
  claudeShellFencePath,
  claudeShellPrefix,
} from "../../session/claude-shell-fence";
import type { ClaudeToken } from "./backend-types";
import { tokenEnv } from "./claude-token-env";
import { CREDENTIAL_ENV_VARS } from "./credential-env-vars";

/**
 * Building the environment for the Claude Agent SDK subprocess.
 *
 * The subprocess runs model-directed Bash on the default hosted-pod profile, so
 * its environment is an exfiltration surface: a prompt-injected agent that runs
 * `printenv` can read anything we hand it. `options.env` REPLACES the child
 * environment (it is not merged onto `process.env`), which is exactly the lever
 * we need — so we build the env from `{}` with an ALLOWLIST of the few
 * operational vars the SDK genuinely needs, never a denylist over `process.env`.
 *
 * Spreading `process.env` and deleting the Anthropic keys (the old approach)
 * still handed the subprocess every host secret: `HOUSTON_SANDBOX_TOKEN`,
 * `HOUSTON_CODE_SANDBOX_TOKEN`, `HOUSTON_TURN_TOKEN`, `HOUSTON_RUNTIME_TOKEN`
 * (config.ts), plus any Composio/GCP credentials. With the sandbox token the
 * agent could call the control plane's `/sandbox/credential` directly and pull
 * the workspace's real provider tokens — defeating the short-TTL Gate-#2 design.
 */

/**
 * The ALLOWLIST of ambient env vars copied verbatim into the subprocess.
 * Compared case-insensitively (Windows env keys vary in case; the proxy vars are
 * honored in both `HTTP_PROXY`/`http_proxy` forms), preserving each key's
 * original case. This is the whole non-credential surface — nothing else from
 * `process.env` reaches a subprocess that runs model-directed Bash.
 *
 * None of these are secrets: they are the process bootstrap (PATH/HOME/shell),
 * locale, temp dirs, Windows runtime vars, and the SAME proxy/custom-CA network
 * vars the SDK itself forwards to its helpers, so proxied / private-CA
 * deployments can still reach the Anthropic API.
 */
const PASSTHROUGH_ENV_VARS: ReadonlySet<string> = new Set(
  [
    // POSIX process + shell essentials — the subprocess and Bash tool need these
    // to locate executables and resolve the user's home.
    "PATH",
    "HOME",
    "SHELL",
    // Identity (non-secret). The Claude CLI names its macOS Keychain item's
    // ACCOUNT after the username, and the bun runtime resolves that from
    // USER/LOGNAME — with neither present it falls back to "unknown", so the
    // SDK reads (and writes) a DIFFERENT Keychain item than the one
    // `claude auth login` created for the same CLAUDE_CONFIG_DIR. The visible
    // failure is brutal: the login says connected, every turn is
    // unauthenticated, and reconnecting can never fix it. USERNAME is the
    // Windows equivalent.
    "USER",
    "LOGNAME",
    "USERNAME",
    // Locale — correct text handling in the subprocess.
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
    // Temp directories.
    "TMPDIR",
    "TMP",
    "TEMP",
    // Windows shell override (non-secret, a filesystem path): the CLI refuses
    // to start on Windows without Git Bash or PowerShell, and the desktop
    // shell repairs this var into our own env at spawn (app/src-tauri
    // shell_env.rs). Dropping it here would make sign-in work but every turn
    // fail on machines that need the override.
    "CLAUDE_CODE_GIT_BASH_PATH",
    // Windows process bootstrap — Node and child processes fail to start without
    // these on native Windows.
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    // Network config the SDK forwards to its own subprocesses (non-secret): proxy
    // routing and an extra CA bundle, so proxied / private-CA hosts still connect.
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "NODE_EXTRA_CA_CERTS",
  ].map((k) => k.toUpperCase()),
);

/**
 * Build the SDK subprocess env from an ALLOWLIST, carrying EXACTLY the connected
 * credential and no host secret.
 *
 * `options.env` REPLACES the subprocess environment, so we start from `{}`, copy
 * only the allowlisted operational vars (`PASSTHROUGH_ENV_VARS`, never the
 * credential keys), pin the ISOLATED config dir, then set the one credential var
 * for the connected token. A stale/ambient `ANTHROPIC_API_KEY` on the host can
 * never survive alongside a user's OAuth token — it was never copied — so a
 * subscription turn cannot silently bill the machine's API key. Shared by the
 * turn backend and the one-shot title path (`./title`) so both isolate identically.
 *
 * `credentialStorageDir` relocates the CLI's OWN credential store away from
 * `configDir` — set for a PERSONAL scope only, and always via
 * `anthropicCredentialStorageDir` (`./scope-guard`), which documents why.
 * Undefined (team / desktop / self-host) sets nothing, leaving this env
 * byte-identical to before that guard existed.
 *
 * `shellFencePath` is the wrapper the CLI runs its Bash tool through
 * (`CLAUDE_CODE_SHELL_PREFIX`). It unsets the CLI's credential variables and
 * caps the memory of what the model spawns inside a memory-limited container
 * (session/claude-shell-fence.ts). Left undefined it resolves for this
 * runtime, which on Linux always has one; null sets nothing. An ambient
 * prefix is never copied — it is not in the allowlist, and the fence is the
 * only wrapper this subprocess may run.
 */
export function buildClaudeEnv(
  token: ClaudeToken | undefined,
  opts: {
    configDir: string;
    credentialStorageDir?: string;
    homeDir?: string;
    shellFencePath?: string | null;
    /** The largest prompt this CLI run sends, in tokens, when known. */
    promptTokens?: number;
    platform?: NodeJS.Platform;
  },
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && PASSTHROUGH_ENV_VARS.has(key.toUpperCase())) {
      env[key] = value;
    }
  }
  env.CLAUDE_CONFIG_DIR = opts.configDir;
  // Files enter a turn only through tool calls, so the CLI's `@path` prompt
  // attachments are off.
  env.CLAUDE_CODE_DISABLE_ATTACHMENTS = "1";
  // The CLI's git context (a `git status` read at startup, outside the tool
  // gate, plus the Bash tool's commit and PR guidance) is ~1.9k tokens on
  // every request, and Houston's agents are not coding agents.
  env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS = "1";
  // The CLI's own compaction stays on (no DISABLE_AUTO_COMPACT): the same
  // switch turns off its recovery from a request that overflows the window,
  // and Houston compacts only between turns (session/autocompact.ts), so a
  // turn that outgrows the account's real window mid-turn (a 1M catalog
  // window can be 200k on the plan) would fail instead. Houston's lower
  // ceiling fires first in every ordinary case.
  // Scrub mode keeps the CLI's credential variables out of the commands the
  // model runs. It also forces permissionMode "default", the mode Houston
  // already runs in. The CLI's Linux build exits at startup with it on unless
  // bubblewrap is installed, and no Houston Linux image ships bubblewrap, so
  // there the shell fence, which Linux always gets, unsets those variables.
  const platform = opts.platform ?? process.platform;
  if (platform !== "linux") env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = "1";
  const fence =
    opts.shellFencePath === undefined
      ? claudeShellFencePath(platform)
      : opts.shellFencePath;
  if (fence !== null) env.CLAUDE_CODE_SHELL_PREFIX = claudeShellPrefix(fence);
  // Claude Code's request timeout covers only the wait for the response
  // headers, and it retries a request that timed out: the CLI's own
  // cancel-and-resend at the first-byte deadline (ai/first-byte.ts). A stream
  // that opened is never cut by it, however long it thinks or writes.
  const deadline = firstByteDeadlineMs(
    "anthropic",
    config.turnFirstByteDeadlineMs,
    opts.promptTokens,
  );
  if (deadline > 0 && env.API_TIMEOUT_MS === undefined)
    env.API_TIMEOUT_MS = String(deadline);
  if (opts.homeDir !== undefined) env.HOME = opts.homeDir;
  if (opts.credentialStorageDir !== undefined) {
    // The CLI reads an EMPTY `CLAUDE_SECURESTORAGE_CONFIG_DIR` as `~/.houston`'s
    // neighbour `~/.claude` — the machine user's PERSONAL credential (trap #2) —
    // and a RELATIVE one against the subprocess cwd, which is the agent's
    // workspace, so credential material would land in user-visible files. Both
    // are worse than the leak this var closes, so neither is accepted.
    if (!isAbsolute(opts.credentialStorageDir))
      throw new Error(
        `the Claude credential store must be an absolute path, got "${opts.credentialStorageDir}"`,
      );
    env.CLAUDE_SECURESTORAGE_CONFIG_DIR = opts.credentialStorageDir;
  }
  // Belt-and-braces: the credential keys are not in the allowlist, but assert the
  // invariant so a future allowlist edit can never re-admit an ambient one.
  for (const key of CREDENTIAL_ENV_VARS) delete env[key];
  Object.assign(env, tokenEnv(token));
  return env;
}
