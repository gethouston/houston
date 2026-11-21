import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type InvalidAgentNameReason,
  invalidAgentNameMessage,
} from "@houston/domain";
import type {
  ClaudeOAuthCredential,
  CustomEndpoint,
  TurnMode,
} from "@houston/protocol";
import type {
  Agent,
  AgentId,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceRuntime,
} from "./domain/types";
import type { FireTurnOptions } from "./fire-turn-options";

export class AgentNameConflictError extends Error {
  constructor(readonly agentName: string) {
    super(`an agent named "${agentName}" already exists in this workspace`);
  }
}

export class InvalidAgentNameError extends Error {
  constructor(
    readonly agentName: string,
    readonly reason: InvalidAgentNameReason,
  ) {
    super(invalidAgentNameMessage(reason));
  }
}

export class ApiKeyRejectedError extends Error {
  constructor(
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "ApiKeyRejectedError";
  }
}

export class LauncherClosedError extends Error {
  constructor() {
    super("the host is shutting down; retry shortly");
    this.name = "LauncherClosedError";
  }
}

export class AgentRenamingError extends Error {
  constructor(readonly agentId: AgentId) {
    super(`agent '${agentId}' is being renamed - retry with its new id`);
    this.name = "AgentRenamingError";
  }
}

export interface WorkspaceStore {
  getOrCreatePersonalWorkspace(userId: UserId): Promise<Workspace>;
  getWorkspace(id: WorkspaceId): Promise<Workspace | null>;

  getAgent(id: AgentId): Promise<Agent | null>;
  listAgents(workspaceId: WorkspaceId): Promise<Agent[]>;
  listWorkspaces(): Promise<Workspace[]>;
  listWorkspacesForUser(userId: UserId): Promise<Workspace[]>;
  listAllAgents(): Promise<Agent[]>;
  createAgent(input: {
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Agent>;
  renameAgent(id: AgentId, name: string): Promise<Agent>;
  deleteAgent(id: AgentId): Promise<void>;
  setWorkspaceRuntime(
    id: WorkspaceId,
    runtime: WorkspaceRuntime,
  ): Promise<Workspace>;
}

export interface TokenVerifier {
  verify(bearer: string): Promise<{ userId: UserId } | null>;
}

export interface RuntimeEndpoint {
  baseUrl: string;
  token: string;
}

export interface ForwardRequest {
  method: string;
  path: string;
  search: string;
  contentType?: string | null;
  body?: Buffer;
  actingAs?: string;
  lastEventId?: string;
}

export type RuntimeState = "running" | "asleep" | "absent";

export interface RuntimeLauncher {
  ensureAwake(agent: Agent): Promise<RuntimeEndpoint>;
  sleep(agentId: AgentId): Promise<void>;
  destroy(agentId: AgentId, opts?: { dropVolume?: boolean }): Promise<void>;
  status(agentId: AgentId): Promise<RuntimeState>;
  hold?(agentId: AgentId): () => void;
  isClosed?(): boolean;
}

export interface ChannelCtx {
  workspace: Workspace;
  agent: Agent;
  actingAs?: string;
  body?: Buffer;
}

export interface TurnPin {
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  mode?: TurnMode | null;
}

export type CaptureResult =
  | { ok: true; provider: string }
  | { ok: false; status: number; error: string; detail?: string };

export interface RuntimeChannel {
  dispatch(
    ctx: ChannelCtx,
    method: string,
    rest: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void>;
  fireTurn(
    ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    opts?: FireTurnOptions,
  ): Promise<void>;
  cancelTurn(ctx: ChannelCtx, conversationId: string): Promise<boolean>;
  busy(ctx: ChannelCtx): Promise<boolean>;
  loginPending?(ctx: ChannelCtx): Promise<boolean>;
  runtimeStatus?(ctx: ChannelCtx): Promise<RuntimeState | "unknown">;
  withQuiesced?<T>(ctx: ChannelCtx, fn: () => Promise<T>): Promise<T>;
  teardown(ctx: ChannelCtx): Promise<void>;
  captureCredential(ctx: ChannelCtx, provider?: string): Promise<CaptureResult>;
  saveApiKeyCredential(
    ctx: ChannelCtx,
    provider: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void>;
  saveClaudeOAuthCredential(
    ctx: ChannelCtx,
    cred: ClaudeOAuthCredential,
    opts?: {
      ifAbsent?: boolean;
    },
  ): Promise<void>;
  saveCustomEndpoint(ctx: ChannelCtx, endpoint: CustomEndpoint): Promise<void>;
  forgetCredential(ctx: ChannelCtx, provider: string): Promise<void>;
}

export interface WorkspaceCredential {
  workspaceId: WorkspaceId;
  provider: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  accountId?: string;
  kind?: "oauth" | "api_key";
  enterpriseUrl?: string;
  scope?: "personal" | "team";
}

export function isApiKeyCredential(cred: WorkspaceCredential): boolean {
  return cred.kind === "api_key" || cred.expiresAt === 0;
}

export interface CredentialActing {
  actingAs?: string;
}

export interface CredentialStore {
  get(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<WorkspaceCredential | null>;
  invalidate?(provider: string, acting?: CredentialActing): void;
  put(
    cred: WorkspaceCredential,
    opts?: { ifAbsent?: boolean } & CredentialActing,
  ): Promise<void>;
  remove(
    workspaceId: WorkspaceId,
    provider: string,
    acting?: CredentialActing,
  ): Promise<void>;
  removeIfAccess(
    workspaceId: WorkspaceId,
    provider: string,
    accessSha256: string,
    opts?: { scope?: "personal" | "team" } & CredentialActing,
  ): Promise<boolean>;
}

export interface CredentialVault {
  sandboxToken(workspaceId: WorkspaceId, agentId: AgentId): string;
  validateSandboxToken(
    token: string,
  ): { workspaceId: WorkspaceId; agentId: AgentId } | null;
}
