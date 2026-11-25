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

const PASSTHROUGH_ENV_VARS: ReadonlySet<string> = new Set(
  [
    "PATH",
    "HOME",
    "SHELL",
    "USER",
    "LOGNAME",
    "USERNAME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LC_MESSAGES",
    "TMPDIR",
    "TMP",
    "TEMP",
    "CLAUDE_CODE_GIT_BASH_PATH",
    "SYSTEMROOT",
    "WINDIR",
    "COMSPEC",
    "PATHEXT",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "ALL_PROXY",
    "NODE_EXTRA_CA_CERTS",
  ].map((k) => k.toUpperCase()),
);

// WHY: Claude Code retries on API_TIMEOUT_MS before the response opens; it never cuts a live stream. ADR-0009
export function buildClaudeEnv(
  token: ClaudeToken | undefined,
  opts: {
    configDir: string;
    credentialStorageDir?: string;
    homeDir?: string;
    shellFencePath?: string | null;
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
  env.CLAUDE_CODE_DISABLE_ATTACHMENTS = "1";
  env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS = "1";
  env.CLAUDE_CODE_TRANSCRIPT_LOCAL_GC = "1";
  const platform = opts.platform ?? process.platform;
  if (platform !== "linux") env.CLAUDE_CODE_SUBPROCESS_ENV_SCRUB = "1";
  const fence =
    opts.shellFencePath === undefined
      ? claudeShellFencePath(platform)
      : opts.shellFencePath;
  if (fence !== null) env.CLAUDE_CODE_SHELL_PREFIX = claudeShellPrefix(fence);
  const deadline = firstByteDeadlineMs(
    "anthropic",
    config.turnFirstByteDeadlineMs,
    opts.promptTokens,
  );
  if (deadline > 0 && env.API_TIMEOUT_MS === undefined)
    env.API_TIMEOUT_MS = String(deadline);
  if (opts.homeDir !== undefined) env.HOME = opts.homeDir;
  if (opts.credentialStorageDir !== undefined) {
    if (!isAbsolute(opts.credentialStorageDir))
      throw new Error(
        `the Claude credential store must be an absolute path, got "${opts.credentialStorageDir}"`,
      );
    env.CLAUDE_SECURESTORAGE_CONFIG_DIR = opts.credentialStorageDir;
  }
  for (const key of CREDENTIAL_ENV_VARS) delete env[key];
  Object.assign(env, tokenEnv(token));
  return env;
}
