import type { ClaudeToken } from "./backend";

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
 * Every env var the Claude Agent SDK reads to authenticate. The SDK honors all
 * three (verified in the installed `sdk.mjs`): a setup/OAuth token via
 * `CLAUDE_CODE_OAUTH_TOKEN`, and an API key via either `ANTHROPIC_API_KEY` or
 * the `ANTHROPIC_AUTH_TOKEN` alias. We never copy these from the ambient env;
 * exactly the one for the connected credential is set, so exactly one survives.
 */
const CREDENTIAL_ENV_VARS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
] as const;

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
 * The single Anthropic auth env var for a credential (empty when none is
 * connected): a setup/OAuth token via `CLAUDE_CODE_OAUTH_TOKEN`, an API key via
 * `ANTHROPIC_API_KEY`.
 */
function tokenEnv(token: ClaudeToken | undefined): Record<string, string> {
  if (token?.kind === "oauth-token")
    return { CLAUDE_CODE_OAUTH_TOKEN: token.value };
  if (token?.kind === "api-key") return { ANTHROPIC_API_KEY: token.value };
  return {};
}

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
 */
export function buildClaudeEnv(
  configDir: string,
  token: ClaudeToken | undefined,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && PASSTHROUGH_ENV_VARS.has(key.toUpperCase())) {
      env[key] = value;
    }
  }
  env.CLAUDE_CONFIG_DIR = configDir;
  // Belt-and-braces: the credential keys are not in the allowlist, but assert the
  // invariant so a future allowlist edit can never re-admit an ambient one.
  for (const key of CREDENTIAL_ENV_VARS) delete env[key];
  Object.assign(env, tokenEnv(token));
  return env;
}
