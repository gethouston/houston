import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { houstonSystemPrompt } from "../houston-prompt";
import { buildLocalHost } from "./host";

/**
 * The local host entry point — the desktop sidecar the Tauri shell spawns. Same
 * host server, local adapter profile. The shell parses the `HOUSTON_HOST_LISTENING`
 * banner for {port, token}, exactly as it parses the runtime's today.
 *
 * Config (env, all optional):
 *   HOUSTON_HOME              ~/.houston (base for the three paths below)
 *   HOUSTON_WORKSPACES_ROOT   ~/.houston/workspaces
 *   HOUSTON_CREDENTIALS_PATH  ~/.houston/credentials.json
 *   HOUSTON_CHAT_HISTORY_DB   ~/.houston/db/houston.db (Rust-era chat to migrate)
 *   HOUSTON_HOST_PORT         4318
 *   HOUSTON_HOST_BIND         127.0.0.1 (desktop). Self-host on a VPS sets
 *                             0.0.0.0 to expose it behind a TLS reverse proxy.
 *   HOUSTON_HOST_TOKEN        random per boot (set a fixed one for self-host)
 *   HOUSTON_RUNTIME_COMMAND   argv to launch a pi-runtime (space-separated);
 *                             explicit override (highest priority). Otherwise:
 *                             the compiled sidecar spawns ITSELF (in runtime
 *                             role via HOUSTON_SIDECAR_ROLE — see host.ts); the
 *                             dev fallback is `bun run <repo>/packages/runtime/src/main.ts`.
 *   HOUSTON_APP_SYSTEM_PROMPT the product voice prompt (from the app)
 */
function runtimeCommand(): string[] {
  // 1. Explicit override always wins.
  const explicit = process.env.HOUSTON_RUNTIME_COMMAND;
  if (explicit) return explicit.split(" ").filter(Boolean);
  // 2. Packaged: we ARE the compiled sidecar (sidecar-entry.ts set
  // HOUSTON_SIDECAR_BINARY to our own execPath). Spawn that same binary; the
  // host adds HOUSTON_SIDECAR_ROLE=runtime so it dispatches into runtime mode.
  // The packaged .app has no `bun` and no repo source, so this is the ONLY path
  // that can launch a runtime there.
  const selfBinary = process.env.HOUSTON_SIDECAR_BINARY;
  if (selfBinary) return [selfBinary];
  // 3. Dev fallback: run the runtime from source, resolved relative to this file
  // (src/local/main.ts → ../../../runtime/src/main.ts).
  const runtimeMain = join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "runtime",
    "src",
    "main.ts",
  );
  return ["bun", "run", runtimeMain];
}

const houstonHome = process.env.HOUSTON_HOME || join(homedir(), ".houston");
const host = buildLocalHost({
  workspacesRoot:
    process.env.HOUSTON_WORKSPACES_ROOT || join(houstonHome, "workspaces"),
  credentialsPath:
    process.env.HOUSTON_CREDENTIALS_PATH ||
    join(houstonHome, "credentials.json"),
  // The Rust-era chat-history db. Default to the canonical path; the migration
  // is a no-op when it is absent (a fresh install) or already done (marker).
  chatHistoryDbPath:
    process.env.HOUSTON_CHAT_HISTORY_DB ||
    join(houstonHome, "db", "houston.db"),
  port: Number(process.env.HOUSTON_HOST_PORT || 4318),
  // Loopback by default (desktop). Self-host sets HOUSTON_HOST_BIND=0.0.0.0.
  bind: process.env.HOUSTON_HOST_BIND || undefined,
  token: process.env.HOUSTON_HOST_TOKEN || randomBytes(32).toString("hex"),
  runtimeCommand: runtimeCommand(),
  // The real Tauri app hands over its own product prompt; this is the built-in
  // default so the agent knows how to create Skills/Routines/learnings.
  systemPrompt: process.env.HOUSTON_APP_SYSTEM_PROMPT || houstonSystemPrompt(),
  onRuntimeLog: (line) => process.stderr.write(line),
});

// A desktop supervisor must not die on a stray error from a child runtime, a
// dropped SSE socket, or a transient fetch. Log loudly and stay up — the user
// would otherwise see "NetworkError" on the next request.
process.on("uncaughtException", (err) => {
  console.error("[local-host] uncaughtException (staying up):", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[local-host] unhandledRejection (staying up):", reason);
});

await host.start();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    host.stop();
    process.exit(0);
  });
}
