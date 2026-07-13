// Helpers for scripts/dev-doctor.mjs — the `pnpm dev` preflight. Pure checks
// only; the entry script owns ordering, output, and the exit code.
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";

/** Run a command, returning trimmed stdout or null on any failure. */
export function tryRun(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Parse a KEY=VALUE env file (comments/blank lines skipped, surrounding
 * quotes stripped). Returns {} when the file is absent — callers decide
 * whether absence is an error.
 */
export function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Compare dotted versions: negative when a < b. Missing segments are 0. */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The `go X.Y.Z` directive from a go.mod, or null. */
export function goModVersion(goModPath) {
  if (!existsSync(goModPath)) return null;
  const m = readFileSync(goModPath, "utf8").match(/^go (\d+(?:\.\d+)*)$/m);
  return m ? m[1] : null;
}

/**
 * True when a local TCP port is free. lsof is the primary check: Node's bind
 * probe sets SO_REUSEADDR, so binding a specific address can SUCCEED while
 * another process holds the wildcard address — the exact way a real pane
 * (binding 0.0.0.0) then dies with "address already in use". The wildcard
 * bind probe remains as the fallback for a machine without lsof.
 */
export function portFree(port) {
  const listeners = tryRun(`lsof -nP -iTCP:${port} -sTCP:LISTEN -Fp`);
  if (listeners !== null) return Promise.resolve(listeners.trim() === "");
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port);
  });
}

/** Best-effort `command (pid)` owning a port, for the port warning line. */
export function portOwner(port) {
  const out = tryRun(`lsof -nP -iTCP:${port} -sTCP:LISTEN -Fcp`);
  if (!out) return "unknown process";
  const pid = out.match(/^p(\d+)/m)?.[1];
  const cmd = out.match(/^c(.+)$/m)?.[1];
  return cmd ? `${cmd}${pid ? ` (pid ${pid})` : ""}` : "unknown process";
}

const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

export const paint = {
  bold: (s) => `${BOLD}${s}${RESET}`,
  fail: (s) => `${RED}${s}${RESET}`,
  warn: (s) => `${YELLOW}${s}${RESET}`,
  ok: (s) => `${GREEN}${s}${RESET}`,
};
