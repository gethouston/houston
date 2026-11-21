import type { Agent, AgentId } from "../domain/types";
import {
  AgentRenamingError,
  LauncherClosedError,
  type RuntimeEndpoint,
  type RuntimeLauncher,
  type RuntimeState,
} from "../ports";
import { spawnUntilHealthy } from "./process-boot";
import { drainUntilExit, shutdownAllAndWait } from "./process-drain";
import { osAllocatePort, pollHealth } from "./process-probes";
import type { ProcessLauncherOptions, Running } from "./process-types";

export type {
  ProcessLauncherOptions,
  RuntimeHandle,
  RuntimeSpawner,
  SpawnSpec,
} from "./process-types";

export class ProcessLauncher implements RuntimeLauncher {
  private readonly running = new Map<AgentId, Running>();
  private readonly booting = new Map<AgentId, Promise<RuntimeEndpoint>>();
  private readonly held = new Map<AgentId, number>();
  private closed = false;
  private readonly allocatePort: () => Promise<number>;
  private readonly waitHealthy: (port: number, token: string) => Promise<void>;

  constructor(private readonly opts: ProcessLauncherOptions) {
    this.allocatePort = opts.allocatePort ?? osAllocatePort;
    this.waitHealthy = opts.waitHealthy ?? ((port) => pollHealth(port));
  }

  async ensureAwake(agent: Agent): Promise<RuntimeEndpoint> {
    if (this.closed) throw new LauncherClosedError();
    if (this.held.has(agent.id)) throw new AgentRenamingError(agent.id);
    const inflight = this.booting.get(agent.id);
    if (inflight) return inflight;
    const existing = this.running.get(agent.id);
    if (existing?.draining) {
      await existing.draining.catch(() => {});
      return this.ensureAwake(agent);
    }
    if (existing)
      return {
        baseUrl: `http://127.0.0.1:${existing.handle.port}`,
        token: existing.token,
      };

    const boot = spawnUntilHealthy(
      {
        opts: this.opts,
        running: this.running,
        held: (id) => this.held.has(id),
        closed: () => this.closed,
        allocatePort: this.allocatePort,
        waitHealthy: this.waitHealthy,
      },
      agent,
    );
    this.booting.set(agent.id, boot);
    try {
      return await boot;
    } finally {
      this.booting.delete(agent.id);
    }
  }

  hold(agentId: AgentId): () => void {
    this.held.set(agentId, (this.held.get(agentId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const n = (this.held.get(agentId) ?? 1) - 1;
      if (n <= 0) this.held.delete(agentId);
      else this.held.set(agentId, n);
    };
  }

  async sleep(
    agentId: AgentId,
    timeoutMs = 5_000,
    forceTimeoutMs = 2_000,
  ): Promise<void> {
    const r = this.running.get(agentId);
    if (!r) return;
    if (r.draining) return r.draining;
    if (!r.handle.onExit) {
      r.handle.kill();
      this.running.delete(agentId);
      return;
    }
    const drain = drainUntilExit(
      this.running,
      agentId,
      r,
      timeoutMs,
      forceTimeoutMs,
    );
    r.draining = drain;
    try {
      await drain;
    } finally {
      r.draining = undefined;
    }
  }

  async destroy(agentId: AgentId): Promise<void> {
    await this.sleep(agentId);
  }

  async status(agentId: AgentId): Promise<RuntimeState> {
    return this.running.has(agentId) ? "running" : "asleep";
  }

  isClosed(): boolean {
    return this.closed;
  }

  shutdownAll(): void {
    this.closed = true;
    for (const r of this.running.values()) r.handle.kill();
    this.running.clear();
  }

  async shutdownAllAndWait(
    timeoutMs = 5_000,
    forceTimeoutMs = 2_000,
  ): Promise<void> {
    this.closed = true;
    await shutdownAllAndWait(this.running, timeoutMs, forceTimeoutMs);
  }
}
