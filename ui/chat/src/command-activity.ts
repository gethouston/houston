/**
 * Classifies a shell / code-execution tool call into the user-facing activity
 * it represents — reaching the internet (curl/wget) or running Python — so the
 * process-block header can narrate it the way a branded integration row does:
 * "Browsing the web · api.github.com", "Python · Running code" (HOU-1048).
 *
 * Pure (no React) so it can be unit-tested under `node:test` without a DOM,
 * like `chat-process-header.ts`. Labels stay English like the tool verbs in
 * `tool-labels.ts` — `ui/` is i18n-agnostic and the app passes no overrides.
 */

import type { ToolEntry } from "./feed-to-messages";
import { toolShortName } from "./tool-labels.ts";

export type CommandActivity =
  | { kind: "web"; host?: string }
  | { kind: "python" };

// Executables that mean "the agent is on the internet" (http/https are
// HTTPie's binaries) and "the agent is running Python". Matched against the
// leading word of each pipeline segment only — a URL passed as an argument to
// a Python script stays a Python activity.
const WEB_CLIENTS = new Set(["curl", "wget", "http", "https"]);
const PYTHON_BINARIES = new Set([
  "python",
  "python3",
  "python2",
  "pip",
  "pip3",
  "pytest",
]);

// Prefix words that wrap the real executable rather than being it.
const WRAPPERS = new Set(["sudo", "env", "nohup", "time", "command", "xargs"]);

/**
 * The activity of a `bash` (either dialect) or `run_code` call, or undefined
 * when the input is malformed / half-streamed or the command is neither web
 * nor Python — the header then falls back to the plain tool verb.
 */
export function commandActivityOf(
  tool: Pick<ToolEntry, "name" | "input">,
): CommandActivity | undefined {
  const short = toolShortName(tool.name).toLowerCase();
  const input = tool.input;
  if (!input || typeof input !== "object") return undefined;
  if (short === "bash") {
    const command = (input as { command?: unknown }).command;
    return typeof command === "string" ? classifyCommand(command) : undefined;
  }
  if (short === "run_code") {
    const { language, code } = input as { language?: unknown; code?: unknown };
    if (language === "python") return { kind: "python" };
    if (language === "bash" && typeof code === "string") {
      return classifyCommand(code);
    }
  }
  return undefined;
}

/**
 * Classifies a shell command line. Web wins over Python when both appear
 * (`curl … | python -` is, to the user, the agent fetching from the web).
 */
export function classifyCommand(command: string): CommandActivity | undefined {
  let sawPython = false;
  for (const segment of command.split(/\|\|?|&&|;|\n/)) {
    const exe = leadingExecutable(segment);
    if (!exe) continue;
    if (WEB_CLIENTS.has(exe)) {
      return { kind: "web", host: hostOf(segment) ?? hostOf(command) };
    }
    if (PYTHON_BINARIES.has(exe)) sawPython = true;
  }
  return sawPython ? { kind: "python" } : undefined;
}

/**
 * The first real executable of one pipeline segment: skips env-var
 * assignments (`FOO=bar cmd`) and wrapper words, and strips any directory
 * prefix (`/usr/bin/curl` → `curl`).
 */
function leadingExecutable(segment: string): string | undefined {
  for (const token of segment.trim().split(/\s+/)) {
    if (!token || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    const bare = token.replace(/^["']+|["']+$/g, "");
    const name = (bare.split("/").at(-1) ?? bare).toLowerCase();
    if (WRAPPERS.has(name)) continue;
    return name;
  }
  return undefined;
}

/**
 * The hostname the command reaches, for the "Browsing the web · {host}" line:
 * the first full URL anywhere in the text, else the first bare domain-looking
 * argument (`curl api.github.com/users`). Leading "www." is dropped; an
 * unparseable candidate yields undefined rather than a garbled host.
 */
function hostOf(text: string): string | undefined {
  const url = text.match(/https?:\/\/[^\s"'<>()[\]]+/i);
  if (url) return parseHost(url[0]);
  for (const token of text.trim().split(/\s+/).slice(1)) {
    if (token.startsWith("-")) continue;
    const bare = token.replace(/^["']+|["']+$/g, "");
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#]|$)/i.test(bare)) {
      return parseHost(`http://${bare}`);
    }
  }
  return undefined;
}

function parseHost(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.length > 0 ? host : undefined;
  } catch {
    return undefined;
  }
}
