import type { Agent } from "../domain/types";
import type { RuntimeEndpoint } from "../ports";
import type { AssistantRuntimeRole } from "./assistant-role";

export interface RuntimeExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string[];
}

export interface RuntimeHandle {
  port: number;
  kill(): void;
  forceKill?(): void;
  onExit?(cb: (exit?: RuntimeExit) => void): void;
}

export interface SpawnSpec {
  workspaceDir: string;
  dataDir: string;
  sharedSkillsDir?: string;
  token: string;
  port: number;
  sandboxToken?: string;
  controlPlaneUrl?: string;
  assistantRole?: AssistantRuntimeRole;
}

export interface RuntimeSpawner {
  spawn(spec: SpawnSpec): RuntimeHandle;
}

export interface ProcessLauncherOptions {
  spawner: RuntimeSpawner;
  workspaceDirFor: (agent: Agent) => string;
  dataDirFor: (agent: Agent) => string;
  sharedSkillsDirFor?: (agent: Agent) => string;
  mintToken: (agent: Agent) => string;
  credentialServing?: {
    controlPlaneUrl: string;
    mintSandboxToken: (agent: Agent) => string;
  };
  assistantRoleFor?: (agent: Agent) => AssistantRuntimeRole | null;
  allocatePort?: () => Promise<number>;
  waitHealthy?: (port: number, token: string) => Promise<void>;
  afterSpawn?: (agent: Agent, endpoint: RuntimeEndpoint) => Promise<void>;
  reportDeath?: (agent: Agent, exit: RuntimeExit) => void;
}

export interface Running {
  handle: RuntimeHandle;
  token: string;
  draining?: Promise<void>;
  stopRequested?: true;
}
