import type { ToolEntry } from "./feed-to-messages";
import { toolShortName } from "./tool-labels.ts";

export type CommandActivity =
  | { kind: "web"; host?: string }
  | { kind: "python" };

const WEB_CLIENTS = new Set(["curl", "wget", "http", "https"]);
const PYTHON_BINARIES = new Set([
  "python",
  "python3",
  "python2",
  "pip",
  "pip3",
  "pytest",
]);

const WRAPPERS = new Set(["sudo", "env", "nohup", "time", "command", "xargs"]);

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

function leadingExecutable(segment: string): string | undefined {
  for (const token of segment.trim().split(/\s+/)) {
    if (!token || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    const bare = stripQuotes(token);
    const name = (bare.split("/").at(-1) ?? bare).toLowerCase();
    if (WRAPPERS.has(name)) continue;
    return name;
  }
  return undefined;
}

function hostOf(text: string): string | undefined {
  const url = text.match(/https?:\/\/[^\s"'<>()[\]]+/i);
  if (url) return parseHost(url[0]);
  for (const token of text.trim().split(/\s+/).slice(1)) {
    if (token.startsWith("-")) continue;
    const bare = stripQuotes(token);
    if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#]|$)/i.test(bare)) {
      return parseHost(`http://${bare}`);
    }
  }
  return undefined;
}

function stripQuotes(token: string): string {
  const isQuote = (ch: string | undefined) => ch === '"' || ch === "'";
  let start = 0;
  let end = token.length;
  while (start < end && isQuote(token[start])) start++;
  while (end > start && isQuote(token[end - 1])) end--;
  return token.slice(start, end);
}

function parseHost(url: string): string | undefined {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host.length > 0 ? host : undefined;
  } catch {
    return undefined;
  }
}
