import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { buildLocalHost } from "./host";

/**
 * The local host entry point — the desktop sidecar the Tauri shell spawns. Same
 * host server, local adapter profile. The shell parses the `HOUSTON_HOST_LISTENING`
 * banner for {port, token}, exactly as it parses the runtime's today.
 *
 * Config (env, all optional):
 *   HOUSTON_WORKSPACES_ROOT   ~/.houston/workspaces
 *   HOUSTON_CREDENTIALS_PATH  ~/.houston/credentials.json
 *   HOUSTON_HOST_PORT         4318
 *   HOUSTON_HOST_TOKEN        random per boot
 *   HOUSTON_RUNTIME_COMMAND   argv to launch a pi-runtime (space-separated);
 *                             defaults to `bun run <repo>/packages/runtime/src/main.ts`
 *   HOUSTON_APP_SYSTEM_PROMPT the product voice prompt (from the app)
 */
function runtimeCommand(): string[] {
  const explicit = process.env.HOUSTON_RUNTIME_COMMAND;
  if (explicit) return explicit.split(" ").filter(Boolean);
  // Dev default: run the runtime from source, resolved relative to this file
  // (src/local/main.ts → ../../../runtime/src/main.ts).
  const runtimeMain = join(import.meta.dir, "..", "..", "..", "runtime", "src", "main.ts");
  return ["bun", "run", runtimeMain];
}

const houstonHome = join(homedir(), ".houston");
const host = buildLocalHost({
  workspacesRoot: process.env.HOUSTON_WORKSPACES_ROOT || join(houstonHome, "workspaces"),
  credentialsPath: process.env.HOUSTON_CREDENTIALS_PATH || join(houstonHome, "credentials.json"),
  port: Number(process.env.HOUSTON_HOST_PORT || 4318),
  token: process.env.HOUSTON_HOST_TOKEN || randomBytes(32).toString("hex"),
  runtimeCommand: runtimeCommand(),
  systemPrompt: process.env.HOUSTON_APP_SYSTEM_PROMPT || undefined,
  onRuntimeLog: (line) => process.stderr.write(line),
});

await host.start();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    host.stop();
    process.exit(0);
  });
}
