import { createServer } from "node:net";
import type { Agent, AgentId } from "../domain/types";
import type { RuntimeEndpoint, RuntimeLauncher, RuntimeState } from "../ports";

/**
 * A spawned runtime process. The launcher only needs its port + a way to kill
 * it; the real spawner wraps a child process, tests inject a fake pointing at a
 * stub server.
 */
export interface RuntimeHandle {
  port: number;
  kill(): void;
  /**
   * Register a one-shot callback fired when the underlying process exits on its
   * own (crash, OOM, the runtime's own SIGTERM handler). Lets the launcher reap
   * a dead child from its live-set so a phantom "running" entry never hands a
   * dead endpoint to the next turn — and fail a boot fast when the child dies
   * before ever answering /health. A handle whose process cannot crash (a test
   * stub) may leave this undefined.
   */
  onExit?(cb: () => void): void;
}

export interface SpawnSpec {
  workspaceDir: string;
  dataDir: string;
  /** Bearer the launcher will present to this runtime (per-process). */
  token: string;
  /** Loopback port the runtime must bind. */
  port: number;
  /** Connect-once: the runtime fetches its access token from the host with this. */
  sandboxToken?: string;
  /** The host's own URL, where the runtime fetches `/sandbox/credential`. */
  controlPlaneUrl?: string;
}

/** Launches one pi-runtime process. Injectable so the lifecycle is unit-testable. */
export interface RuntimeSpawner {
  spawn(spec: SpawnSpec): RuntimeHandle;
}

export interface ProcessLauncherOptions {
  spawner: RuntimeSpawner;
  /** The agent's working directory (its files live here). */
  workspaceDirFor: (agent: Agent) => string;
  /** Where the runtime keeps auth.json + sessions for this agent. */
  dataDirFor: (agent: Agent) => string;
  /** Per-process bearer token (reuse the HMAC vault). */
  mintToken: (agent: Agent) => string;
  /**
   * Connect-once credential serving: the runtime is keyless and fetches its
   * access token from the host's /sandbox/credential. Omit to let the runtime
   * use its own auth.json (loopback OAuth) instead.
   */
  credentialServing?: {
    controlPlaneUrl: string;
    mintSandboxToken: (agent: Agent) => string;
  };
  /** Allocate a free loopback port. Default: ask the OS. Injectable for tests. */
  allocatePort?: () => Promise<number>;
  /** Poll the runtime's /health until ready. Injectable for tests. */
  waitHealthy?: (port: number, token: string) => Promise<void>;
  /** Run once after each newly spawned runtime becomes healthy. */
  afterSpawn?: (agent: Agent, endpoint: RuntimeEndpoint) => Promise<void>;
}

interface Running {
  handle: RuntimeHandle;
  token: string;
}

/** Default free-port allocator: bind :0, read the assigned port, release it. */
function osAllocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * How long a spawned runtime gets to bind its port and answer /health. A cold
 * boot inside a CPU-capped engine pod measures ~10.5s — the old 10s budget lost
 * that race by milliseconds and SIGTERM'd runtimes right as they logged
 * "runtime listening" (surfacing as "never became healthy" on the first message
 * to a fresh agent). Generous is safe here: a runtime that DIES during boot
 * fails fast via the launcher's onExit abort and never waits this out.
 */
const BOOT_HEALTH_BUDGET_MS = 60_000;

/** Default health probe: GET /health until 200 or the boot budget elapses. */
async function pollHealth(port: number): Promise<void> {
  const deadline = Date.now() + BOOT_HEALTH_BUDGET_MS;
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) {
        await r.text();
        return;
      }
    } catch {
      // not up yet
    }
    if (Date.now() > deadline)
      throw new Error(
        `runtime on port ${port} never became healthy within ${BOOT_HEALTH_BUDGET_MS / 1000}s`,
      );
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * The local profile's RuntimeLauncher: one pi-runtime SUBPROCESS per agent on
 * the user's machine — the desktop analog of the GKE pod. Lazily spawned on
 * first touch, kept warm, SIGTERM'd on sleep. Combined with the existing
 * ProxyChannel, the local host dispatches to these exactly as the cloud host
 * dispatches to pods: same channel code, different launcher. "Local is the
 * cloud control plane shrunk to one machine" — literally, at the type level.
 */
export class ProcessLauncher implements RuntimeLauncher {
  private readonly running = new Map<AgentId, Running>();
  private readonly booting = new Map<AgentId, Promise<RuntimeEndpoint>>();
  private readonly allocatePort: () => Promise<number>;
  private readonly waitHealthy: (port: number, token: string) => Promise<void>;

  constructor(private readonly opts: ProcessLauncherOptions) {
    this.allocatePort = opts.allocatePort ?? osAllocatePort;
    this.waitHealthy = opts.waitHealthy ?? ((port) => pollHealth(port));
  }

  async ensureAwake(agent: Agent): Promise<RuntimeEndpoint> {
    // Single-flight per agent: the `running` entry exists BEFORE the child is
    // healthy (so sleep/shutdown can kill a mid-boot process), so a concurrent
    // caller must not read it as "awake" — it would be handed a port nobody has
    // bound yet and proxy into connection-refused (surfacing as a 502 the
    // desktop renders as an empty chat / disconnected provider). Everyone who
    // arrives during a boot awaits the SAME spawn+health instead.
    const inflight = this.booting.get(agent.id);
    if (inflight) return inflight;
    const existing = this.running.get(agent.id);
    if (existing)
      return {
        baseUrl: `http://127.0.0.1:${existing.handle.port}`,
        token: existing.token,
      };

    const boot = this.spawnUntilHealthy(agent);
    this.booting.set(agent.id, boot);
    try {
      return await boot;
    } finally {
      this.booting.delete(agent.id);
    }
  }

  private async spawnUntilHealthy(agent: Agent): Promise<RuntimeEndpoint> {
    const token = this.opts.mintToken(agent);
    const port = await this.allocatePort();
    const cred = this.opts.credentialServing;
    const handle = this.opts.spawner.spawn({
      workspaceDir: this.opts.workspaceDirFor(agent),
      dataDir: this.opts.dataDirFor(agent),
      token,
      port,
      ...(cred
        ? {
            sandboxToken: cred.mintSandboxToken(agent),
            controlPlaneUrl: cred.controlPlaneUrl,
          }
        : {}),
    });
    const entry: Running = { handle, token };
    this.running.set(agent.id, entry);
    // Reap a crashed runtime from the live-set: without this a process that
    // dies on its own (OOM, panic) lingers as a phantom "running" entry and
    // ensureAwake keeps handing its dead port to every turn. Only evict if the
    // map still points at THIS handle — a sleep()+respawn must not be clobbered.
    // The SAME (single) registration also aborts a boot in flight: a child that
    // dies mid-boot fails the caller NOW instead of polling a dead port until
    // the health budget runs out.
    let abortBoot: ((err: Error) => void) | undefined;
    handle.onExit?.(() => {
      if (this.running.get(agent.id) === entry) this.running.delete(agent.id);
      abortBoot?.(new Error("runtime exited before becoming healthy"));
    });
    try {
      // The raced rejection is always observed — race() subscribes to both
      // promises up front — so an exit after settle can't surface as an
      // unhandled rejection (and clearing abortBoot below stops it firing at all).
      await Promise.race([
        this.waitHealthy(handle.port, token),
        new Promise<never>((_, reject) => {
          abortBoot = reject;
        }),
      ]);
    } catch (err) {
      // A runtime that never came up must not linger as a zombie nor be cached
      // as "running" — kill it and surface the failure (the turn errors visibly).
      handle.kill();
      this.running.delete(agent.id);
      throw err;
    } finally {
      abortBoot = undefined;
    }
    const endpoint = {
      baseUrl: `http://127.0.0.1:${handle.port}`,
      token,
    };
    try {
      await this.opts.afterSpawn?.(agent, endpoint);
    } catch (error) {
      handle.kill();
      if (this.running.get(agent.id) === entry) this.running.delete(agent.id);
      throw error;
    }
    return endpoint;
  }

  async sleep(agentId: AgentId): Promise<void> {
    const r = this.running.get(agentId);
    if (!r) return; // already asleep — pi's continueRecent restores on next wake
    r.handle.kill();
    this.running.delete(agentId);
  }

  async destroy(agentId: AgentId): Promise<void> {
    // Locally there is no volume to drop — the agent's files are the user's own
    // directory, deleted by the supervisor, not the launcher. Just stop the process.
    await this.sleep(agentId);
  }

  async status(agentId: AgentId): Promise<RuntimeState> {
    return this.running.has(agentId) ? "running" : "asleep";
  }

  /** Kill every running runtime — called on supervisor shutdown so a restart
   *  doesn't orphan child processes (which would hold ports + the agent dir). */
  shutdownAll(): void {
    for (const r of this.running.values()) r.handle.kill();
    this.running.clear();
  }

  /**
   * shutdownAll, but resolved only once every child has ACTUALLY exited (or
   * timeoutMs passes). The store-sync stop path needs this: a final /data sync
   * taken while a child is still flushing its last conversation write would
   * persist a torn file as the agent's durable state. Handles without onExit
   * (test stubs) count as already exited.
   */
  async shutdownAllAndWait(timeoutMs = 5_000): Promise<void> {
    const waits: Promise<void>[] = [];
    for (const r of this.running.values()) {
      const { onExit } = r.handle;
      if (onExit) {
        waits.push(new Promise<void>((resolve) => onExit(() => resolve())));
      }
      r.handle.kill();
    }
    this.running.clear();
    if (waits.length === 0) return;
    await Promise.race([
      Promise.all(waits).then(() => undefined),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
  }
}
