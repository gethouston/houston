import type { Agent, AgentId } from "../domain/types";
import {
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

/**
 * The local profile's RuntimeLauncher: one pi-runtime SUBPROCESS per agent on
 * the user's machine - the desktop analog of the GKE pod. Lazily spawned on
 * first touch, kept warm, SIGTERM'd on sleep. Combined with the existing
 * ProxyChannel, the local host dispatches to these exactly as the cloud host
 * dispatches to pods: same channel code, different launcher. "Local is the
 * cloud control plane shrunk to one machine" - literally, at the type level.
 */
export class ProcessLauncher implements RuntimeLauncher {
  private readonly running = new Map<AgentId, Running>();
  private readonly booting = new Map<AgentId, Promise<RuntimeEndpoint>>();
  /** Refcounted rename latch - see hold(). */
  private readonly held = new Map<AgentId, number>();
  /**
   * Set once shutdownAll* has run: this launcher spawns nothing ever again.
   * shutdownAllAndWait clears the live-set BEFORE the children have exited,
   * so without the latch a dispatch landing in that drain window (the
   * client's provider poll, a routine, the SSE resume) found no running entry
   * and respawned a runtime the exiting host never kills - an orphan that,
   * on a serve-mode pod, booted into a host whose listener was already
   * closed and logged an ECONNREFUSED per known provider (PRODUCT-1399).
   */
  private closed = false;
  private readonly allocatePort: () => Promise<number>;
  private readonly waitHealthy: (port: number, token: string) => Promise<void>;

  constructor(private readonly opts: ProcessLauncherOptions) {
    this.allocatePort = opts.allocatePort ?? osAllocatePort;
    this.waitHealthy = opts.waitHealthy ?? ((port) => pollHealth(port));
  }

  async ensureAwake(agent: Agent): Promise<RuntimeEndpoint> {
    if (this.closed) throw new LauncherClosedError();
    // Held = a rename is moving this id's directory RIGHT NOW. Refuse loudly:
    // the app's own reconnect storm (SSE resume within ~500ms, watchdog polls,
    // provider probes) arrives with the old id during the quiesce window, and
    // a runtime spawned for it would be born pointing at the directory being
    // renamed - its module-eval alone re-mkdirs the old tree (HOU-827).
    if (this.held.has(agent.id))
      throw new Error(
        `agent '${agent.id}' is being renamed - retry with its new id`,
      );
    // Single-flight per agent: the `running` entry exists BEFORE the child is
    // healthy (so sleep/shutdown can kill a mid-boot process), so a concurrent
    // caller must not read it as "awake" - it would be handed a port nobody has
    // bound yet and proxy into connection-refused (surfacing as a 502 the
    // desktop renders as an empty chat / disconnected provider). Everyone who
    // arrives during a boot awaits the SAME spawn+health instead.
    const inflight = this.booting.get(agent.id);
    if (inflight) return inflight;
    const existing = this.running.get(agent.id);
    if (existing?.draining) {
      // A sleep is mid-drain: the process is alive but dying. Its port is a
      // corpse-to-be, and spawning now would race two children over one
      // directory - wait the drain out, then re-enter (respawn or, if the
      // child refused to die, hand back the live entry).
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

  /**
   * Latch an agent id against respawn while an operation invalidates its
   * id→directory mapping (rename). Refcounted so overlapping holds compose;
   * the returned release is idempotent per acquisition.
   */
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
    if (!r) return; // already asleep - pi's continueRecent restores on next wake
    // Single-flight: a concurrent sleep joins the drain already in progress
    // (and shares its outcome) instead of double-killing or - worse - seeing
    // the entry gone and reporting "asleep" while the child still lives.
    if (r.draining) return r.draining;
    // Handles without onExit (test stubs) count as already exited - same
    // posture as shutdownAllAndWait.
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
    // Locally there is no volume to drop - the agent's files are the user's own
    // directory, deleted by the supervisor, not the launcher. Just stop the process.
    await this.sleep(agentId);
  }

  async status(agentId: AgentId): Promise<RuntimeState> {
    return this.running.has(agentId) ? "running" : "asleep";
  }

  /** Kill every running runtime - called on supervisor shutdown so a restart
   *  doesn't orphan child processes (which would hold ports + the agent dir). */
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
