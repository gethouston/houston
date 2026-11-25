import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type AnthropicLoginCallbacks = {
  // WHY: Presence of instructions selects token paste; absent means open the URL and paste its code. ADR-0008
  onAuth: (info: { url: string; instructions?: string }) => void;
  onManualCodeInput: () => Promise<string>;
};

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

export class CliUnavailableError extends Error {}

export function scrubTokens(s: string): string {
  return s.replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-…");
}

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
    if (end < 0) return out;
    rest = after.slice(end);
  }
  return out + rest;
}

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
  return token.replace(/[.)]+$/, "");
}

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

export type CliMintedOauth = {
  access: string;
  refresh: string;
  expires: number;
};

export function readMintedFile(dir: string): string | null {
  const path = join(dir, ".credentials.json");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

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
