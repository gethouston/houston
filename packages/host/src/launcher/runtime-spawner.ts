import { spawn } from "node:child_process";
import type { RuntimeHandle, RuntimeSpawner, SpawnSpec } from "./process";
import type { RuntimeExit } from "./process-types";
import { runtimeParentEnv } from "./runtime-parent-env";

export interface RuntimeSpawnerOptions {
  command: string[];
  env?: (spec: SpawnSpec) => Record<string, string>;
  onLog?: (line: string) => void;
}

export const STDERR_TAIL_LINES = 24;

export const STDERR_CLOSE_GRACE_MS = 100;

export class StderrTail {
  private readonly lines: string[] = [];
  private partial = "";

  push(chunk: string): void {
    const parts = (this.partial + chunk).split("\n");
    this.partial = parts.pop() ?? "";
    for (const line of parts) {
      if (line.trim() === "") continue;
      this.lines.push(line);
      if (this.lines.length > STDERR_TAIL_LINES) this.lines.shift();
    }
  }

  snapshot(): string[] {
    const tail = this.partial.trim() === "" ? [] : [this.partial];
    return [...this.lines, ...tail].slice(-STDERR_TAIL_LINES);
  }
}

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
        ...runtimeParentEnv(process.env),
        ...this.opts.env?.(spec),
        HOUSTON_HOST: "127.0.0.1",
        HOUSTON_PORT: String(spec.port),
        HOUSTON_WORKSPACE_DIR: spec.workspaceDir,
        HOUSTON_DATA_DIR: spec.dataDir,
        ...(spec.sharedSkillsDir
          ? { HOUSTON_SHARED_SKILLS_DIR: spec.sharedSkillsDir }
          : {}),
        HOUSTON_RUNTIME_TOKEN: spec.token,
        ...(spec.sandboxToken
          ? { HOUSTON_SANDBOX_TOKEN: spec.sandboxToken }
          : {}),
        ...(spec.controlPlaneUrl
          ? { HOUSTON_CONTROL_PLANE_URL: spec.controlPlaneUrl }
          : {}),
      },
      stdio: this.opts.onLog
        ? ["ignore", "pipe", "pipe"]
        : ["ignore", "inherit", "pipe"],
    });
    const log = this.opts.onLog ?? (() => {});
    const stderrTail = new StderrTail();
    if (this.opts.onLog) {
      child.stdout?.on("data", (b: Buffer) => log(b.toString()));
    }
    child.stderr?.on("data", (b: Buffer) => {
      const text = b.toString();
      stderrTail.push(text);
      if (this.opts.onLog) log(text);
      else process.stderr.write(text);
    });
    child.on("error", (err) => log(`[runtime spawn error] ${err.message}\n`));
    return {
      port: spec.port,
      kill: () => {
        try {
          child.kill("SIGTERM");
        } catch {}
      },
      forceKill: () => {
        try {
          child.kill("SIGKILL");
        } catch {}
      },
      // WHY: A missing binary emits error and close but never exit; fire once on the first. ADR-0016
      onExit: (cb) => {
        let fired = false;
        let graceTimer: ReturnType<typeof setTimeout> | undefined;
        const fire = (
          code: number | null | Error,
          signal: NodeJS.Signals | null = null,
        ) => {
          if (fired) return;
          fired = true;
          if (graceTimer) clearTimeout(graceTimer);
          child.off("exit", onExited);
          child.off("close", fire);
          child.off("error", fire);
          const exit: RuntimeExit =
            code instanceof Error
              ? {
                  code: null,
                  signal: null,
                  stderrTail: [...stderrTail.snapshot(), code.message],
                }
              : { code, signal, stderrTail: stderrTail.snapshot() };
          cb(exit);
        };
        const onExited = (
          code: number | null,
          signal: NodeJS.Signals | null,
        ) => {
          graceTimer = setTimeout(
            () => fire(code, signal),
            STDERR_CLOSE_GRACE_MS,
          );
          graceTimer.unref?.();
        };
        child.once("exit", onExited);
        child.once("close", fire);
        child.once("error", fire);
      },
    };
  }
}
