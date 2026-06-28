import { spawn } from "node:child_process";
import type { RuntimeHandle, RuntimeSpawner, SpawnSpec } from "./process";

export interface RuntimeSpawnerOptions {
  /**
   * argv that launches ONE pi-runtime in server mode — e.g.
   * `["node", "--import", "tsx", "<repo>/packages/runtime/src/main.ts"]`
   * in dev, or `["<resourceDir>/houston-runtime"]` for the compiled sidecar
   * in the .app.
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
export class RuntimeProcessSpawner implements RuntimeSpawner {
  constructor(private readonly opts: RuntimeSpawnerOptions) {
    if (opts.command.length === 0)
      throw new Error("RuntimeProcessSpawner needs a non-empty command");
  }

  spawn(spec: SpawnSpec): RuntimeHandle {
    const [cmd, ...args] = this.opts.command;
    if (cmd === undefined)
      throw new Error("RuntimeProcessSpawner: command is empty");
    const child = spawn(cmd, args, {
      env: {
        ...process.env,
        ...this.opts.env,
        HOUSTON_HOST: "127.0.0.1",
        HOUSTON_PORT: String(spec.port),
        HOUSTON_WORKSPACE_DIR: spec.workspaceDir,
        HOUSTON_DATA_DIR: spec.dataDir,
        HOUSTON_RUNTIME_TOKEN: spec.token,
        // Connect-once: keyless runtime fetches its token from the host.
        ...(spec.sandboxToken
          ? { HOUSTON_SANDBOX_TOKEN: spec.sandboxToken }
          : {}),
        ...(spec.controlPlaneUrl
          ? { HOUSTON_CONTROL_PLANE_URL: spec.controlPlaneUrl }
          : {}),
      },
      stdio: this.opts.onLog ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    const log = this.opts.onLog ?? (() => {});
    if (this.opts.onLog) {
      child.stdout?.on("data", (b: Buffer) => log(b.toString()));
      child.stderr?.on("data", (b: Buffer) => log(b.toString()));
    }
    // CRITICAL: an unhandled ChildProcess 'error' (spawn failure, EPIPE, …)
    // throws and would take the whole host down. The launcher's health probe
    // already surfaces a runtime that never comes up; here we just keep the
    // supervisor alive.
    child.on("error", (err) => log(`[runtime spawn error] ${err.message}\n`));
    return {
      port: spec.port,
      kill: () => {
        // SIGTERM lets the runtime drain; it exits on its own. A hung process is
        // reaped by the supervisor's process-tree teardown, not here.
        try {
          child.kill("SIGTERM");
        } catch {
          /* already gone */
        }
      },
      // Fires once when the child exits — whether we killed it or it crashed on
      // its own. The launcher uses this to drop a dead runtime from its live-set
      // so a crash doesn't leave a phantom "running" entry behind.
      onExit: (cb) => child.once("exit", cb),
    };
  }
}
