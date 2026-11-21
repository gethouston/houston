import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { config } from "../../config";
import {
  bashMemoryFencePrefix,
  resolveChildMemoryCap,
} from "../child-memory-fence";

const BASH_PASSTHROUGH_ENV: readonly string[] = [
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
];

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

export function bashMemoryFenceOptions(capBytes: number | null): {
  commandPrefix?: string;
} {
  return capBytes === null
    ? {}
    : { commandPrefix: bashMemoryFencePrefix(capBytes) };
}

export function makeScrubbedBashTool(
  cwd: string,
  opts: { memoryCapBytes?: number | null; toolShell?: string | null } = {},
) {
  const cap =
    opts.memoryCapBytes === undefined
      ? resolveChildMemoryCap()
      : opts.memoryCapBytes;
  const toolShell =
    opts.toolShell === undefined ? config.toolShell : opts.toolShell;
  return createBashToolDefinition(cwd, {
    ...bashMemoryFenceOptions(cap),
    ...(toolShell === null ? {} : { shellPath: toolShell }),
    spawnHook: (context) => ({ ...context, env: scrubbedBashEnv() }),
  });
}
