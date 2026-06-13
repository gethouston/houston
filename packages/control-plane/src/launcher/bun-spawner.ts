import { spawn } from "node:child_process";
import type { RuntimeHandle, RuntimeSpawner, SpawnSpec } from "./process";

export interface BunSpawnerOptions {
  /**
   * argv that launches ONE pi-runtime in server mode — e.g.
   * `["bun", "run", "<repo>/packages/runtime/src/main.ts"]` in dev, or
   * `["<resourceDir>/houston-runtime"]` for the compiled sidecar in the .app.
   */
  command: string[];
  /** Extra env for every runtime (e.g. HOUSTON_SYSTEM_PROMPT from the app). */
  env?: Record<string, string>;
  /** Where child stdio goes. Default: inherit (visible in the app's logs). */
  onLog?: (line: string) => void;
}

/**
 * Spawns a pi-runtime as a child process — the production local launcher. Each
 * agent gets its own process bound to its own workspace dir + loopback port,
 * carrying the per-process bearer the host presents back when proxying.
 */
export class BunRuntimeSpawner implements RuntimeSpawner {
  constructor(private readonly opts: BunSpawnerOptions) {
    if (opts.command.length === 0) throw new Error("BunRuntimeSpawner needs a non-empty command");
  }

  spawn(spec: SpawnSpec): RuntimeHandle {
    const [cmd, ...args] = this.opts.command;
    const child = spawn(cmd!, args, {
      env: {
        ...process.env,
        ...this.opts.env,
        HOUSTON_HOST: "127.0.0.1",
        HOUSTON_PORT: String(spec.port),
        HOUSTON_WORKSPACE_DIR: spec.workspaceDir,
        HOUSTON_DATA_DIR: spec.dataDir,
        HOUSTON_RUNTIME_TOKEN: spec.token,
      },
      stdio: this.opts.onLog ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    if (this.opts.onLog) {
      const log = this.opts.onLog;
      child.stdout?.on("data", (b: Buffer) => log(b.toString()));
      child.stderr?.on("data", (b: Buffer) => log(b.toString()));
    }
    return {
      port: spec.port,
      kill: () => {
        // SIGTERM lets the runtime drain; it exits on its own. A hung process is
        // reaped by the supervisor's process-tree teardown, not here.
        child.kill("SIGTERM");
      },
    };
  }
}
