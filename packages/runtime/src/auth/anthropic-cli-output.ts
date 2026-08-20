import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Stream plumbing + line parsing for the Claude CLI login child
 * (anthropic-cli-login.ts) — everything here is pure or stream-local, so the
 * driver stays under the file limit and this half is unit-testable without a
 * child process. The `visit:` parsing mirrors the desktop shell's
 * `claude_login/resolve.rs` (same CLI, same lines); keep the two in sync.
 */

/** The `auth_code` login surface the runtime relays to the webapp. */
export type AnthropicLoginCallbacks = {
  /**
   * Surface the sign-in step. With `instructions` it renders as the token
   * paste flow (url = help reference); without, as the open-this-URL +
   * paste-the-code flow (the CLI subscription login).
   */
  onAuth: (info: { url: string; instructions?: string }) => void;
  /** Resolves with the user's pasted value via completeLogin's paste promise. */
  onManualCodeInput: () => Promise<string>;
};

/** The slice of a spawned child the login driver consumes (test seam). */
export type LoginChild = {
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  stdin: { write: (chunk: string) => void };
  once(
    event: "exit",
    cb: (code: number | null, signal?: unknown) => void,
  ): void;
  once(event: "error", cb: (err: Error) => void): void;
  kill(): void;
};

/**
 * A CLI login that could not START — spawn failure, or death before the
 * sign-in URL was surfaced. Nothing user-visible happened yet, so the caller
 * downgrades to the token paste flow instead of surfacing an error.
 */
export class CliUnavailableError extends Error {}

/** Redact any `sk-ant-…` material before a string can reach logs or a toast. */
export function scrubTokens(s: string): string {
  return s.replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-…");
}

/**
 * Remove OSC 8 hyperlink sequences (`ESC]8;;URI BEL|ESC\` … `ESC]8;; BEL|ESC\`)
 * so only the visible text remains: the CLI hyperlink-wraps the URL on its
 * `visit:` line even when stdout is a pipe, and the token after `visit:` would
 * otherwise start with an escape byte and miss the parse.
 */
export function stripOsc8(line: string): string {
  let out = "";
  let rest = line;
  for (;;) {
    const start = rest.indexOf("\u001b]8;");
    if (start < 0) break;
    out += rest.slice(0, start);
    const after = rest.slice(start);
    const bel = after.indexOf("\u0007");
    const st = after.indexOf("\u001b\\");
    const end =
      bel >= 0 && (st < 0 || bel < st) ? bel + 1 : st >= 0 ? st + 2 : -1;
    // Unterminated sequence: drop the tail rather than emit raw escapes.
    if (end < 0) return out;
    rest = after.slice(end);
  }
  return out + rest;
}

/**
 * Parse an authorize URL out of a `visit:` line like
 * `If the browser didn't open, visit: https://claude.ai/oauth/authorize?…`.
 * Returns null without a `visit:` marker or when the following token is not an
 * http(s) URL.
 */
export function extractVisitUrl(line: string): string | null {
  const marker = "visit:";
  const clean = stripOsc8(line);
  const idx = clean.indexOf(marker);
  if (idx < 0) return null;
  const token = clean
    .slice(idx + marker.length)
    .trim()
    .split(/\s+/)[0];
  if (!token || !(token.startsWith("http://") || token.startsWith("https://")))
    return null;
  // Strip trailing sentence punctuation the CLI might append (`.` / `)`).
  return token.replace(/[.)]+$/, "");
}

/** Deliver a stream to `onLine` one line at a time (trailing partial included). */
export function wireLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
): void {
  let buf = "";
  stream.setEncoding?.("utf8");
  stream.on("data", (chunk: string | Buffer) => {
    buf += chunk.toString();
    for (;;) {
      const i = buf.indexOf("\n");
      if (i < 0) break;
      onLine(buf.slice(0, i));
      buf = buf.slice(i + 1);
    }
  });
  stream.on("end", () => {
    if (buf) onLine(buf);
  });
}

/** The credential the CLI mints: subscription OAuth with a refresh token. */
export type CliMintedOauth = {
  access: string;
  refresh: string;
  expires: number;
};

/** Read the CLI's minted credential file from the login dir, or null when it wrote none. */
export function readMintedFile(dir: string): string | null {
  const path = join(dir, ".credentials.json");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/** Parse the CLI credential file into the pi `oauth` fields. Throws on shape drift. */
export function parseMintedCredential(raw: string): CliMintedOauth {
  const parsed = JSON.parse(raw) as {
    claudeAiOauth?: {
      accessToken?: unknown;
      refreshToken?: unknown;
      expiresAt?: unknown;
    };
  };
  const o = parsed.claudeAiOauth;
  if (
    !o ||
    typeof o.accessToken !== "string" ||
    typeof o.refreshToken !== "string" ||
    !o.accessToken ||
    !o.refreshToken
  ) {
    throw new Error(
      "Claude sign-in finished but the minted credential has an unexpected shape",
    );
  }
  return {
    access: o.accessToken,
    refresh: o.refreshToken,
    expires: typeof o.expiresAt === "number" ? o.expiresAt : 0,
  };
}
