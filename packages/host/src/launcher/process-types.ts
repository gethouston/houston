import type { Agent } from "../domain/types";
import type { RuntimeEndpoint } from "../ports";
import type { AssistantRuntimeRole } from "./assistant-role";

/**
 * A spawned runtime process. The launcher only needs its port + a way to kill
 * it; the real spawner wraps a child process, tests inject a fake pointing at a
 * stub server.
 */
export interface RuntimeHandle {
  port: number;
  kill(): void;
  /**
   * Non-negotiable kill (SIGKILL) for a child that ignored kill()'s SIGTERM.
   * The launcher escalates to this before it will report the runtime gone —
   * a rename must never proceed over a live child (HOU-827). Optional for
   * test stubs whose processes cannot wedge.
   */
  forceKill?(): void;
  /**
   * Register a one-shot callback fired when the underlying process exits on its
   * own (crash, OOM, the runtime's own SIGTERM handler). Lets the launcher reap
   * a dead child from its live-set so a phantom "running" entry never hands a
   * dead endpoint to the next turn - and fail a boot fast when the child dies
   * before ever answering /health. A handle whose process cannot crash (a test
   * stub) may leave this undefined.
   */
  onExit?(cb: () => void): void;
}

export interface SpawnSpec {
  workspaceDir: string;
  dataDir: string;
  /** Read-only workspace-shared skills mirror, local filesystem profiles only. */
  sharedSkillsDir?: string;
  /** Bearer the launcher will present to this runtime (per-process). */
  token: string;
  /** Loopback port the runtime must bind. */
  port: number;
  /** Connect-once: the runtime fetches its access token from the host with this. */
  sandboxToken?: string;
  /** The host's own URL, where the runtime fetches `/sandbox/credential`. */
  controlPlaneUrl?: string;
  /**
   * Set ONLY for the runtime that is the user's personal-assistant coordinator
   * (launcher/assistant-role.ts). The spawner turns it into the one role
   * variable the child reads; every other runtime is spawned without it and is
   * a plain agent by construction.
   */
  assistantRole?: AssistantRuntimeRole;
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
  /** Shared skills mirror; omitted where this host has no hydrated filesystem copy. */
  sharedSkillsDirFor?: (agent: Agent) => string;
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
  /**
   * This agent's assistant role, decided by the HOST (it knows which agent it
   * spawns) rather than guessed inside the runtime. Omitted where no deployment
   * can hold an assistant, which spawns every runtime as a plain agent.
   */
  assistantRoleFor?: (agent: Agent) => AssistantRuntimeRole | null;
  /** Allocate a free loopback port. Default: ask the OS. Injectable for tests. */
  allocatePort?: () => Promise<number>;
  /** Poll the runtime's /health until ready. Injectable for tests. */
  waitHealthy?: (port: number, token: string) => Promise<void>;
  /** Run once after each newly spawned runtime becomes healthy. */
  afterSpawn?: (agent: Agent, endpoint: RuntimeEndpoint) => Promise<void>;
}

export interface Running {
  handle: RuntimeHandle;
  token: string;
  /**
   * Present while a sleep() is waiting for this child to actually exit. The
   * entry stays in the live-set for the whole drain: deleting it up front
   * made status() report "asleep" for a process that was still alive, and a
   * dispatch arriving in that window respawned a SECOND runtime over the
   * same directory (HOU-827's resurrect vector during a rename).
   */
  draining?: Promise<void>;
}
