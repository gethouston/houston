import type {
  AuthStatus,
  CustomEndpoint,
  LoginInfo,
  LoginState,
  ProviderId,
} from "@houston/runtime-client";
import type { ProviderCredentialWrites } from "./credential-store";

export type { AuthStatus, CustomEndpoint, LoginInfo, LoginState, ProviderId };

export interface ProviderVM {
  id: ProviderId;
  name: string;
  configured: boolean;
  isActive: boolean;
  activeModel: string;
  models: string[];
  login?: LoginState | null;
  enterpriseUrl?: string | null;
  reconnectBy?: number;
}

export interface ProvidersViewModel {
  loaded: boolean;
  providers: ProviderVM[];
  activeProvider?: ProviderId;
}

export const providersScope = (agentId: string): string =>
  `providers/${agentId}`;

export const ProvidersCommand = {
  Refresh: "providers/refresh",
  RefreshStatus: "providers/refreshStatus",
  Login: "providers/login",
  CancelLogin: "providers/cancelLogin",
  CompleteLogin: "providers/completeLogin",
  SetApiKey: "providers/setApiKey",
  Logout: "providers/logout",
  SetModel: "providers/setModel",
} as const;
export type ProvidersCommandType =
  (typeof ProvidersCommand)[keyof typeof ProvidersCommand];

export interface LoginOptions {
  deviceAuth?: boolean;
  enterpriseDomain?: string;
}

export interface SetModelOptions {
  model?: string;
  effort?: string;
  provider?: ProviderId;
}

export interface ProvidersWrites {
  status(agentId: string): Promise<AuthStatus>;
  setApiKey(agentId: string, provider: ProviderId, key: string): Promise<void>;
  logout(agentId: string, provider: ProviderId): Promise<void>;
  setModel(agentId: string, opts: SetModelOptions): Promise<void>;
  setCustomEndpoint(agentId: string, endpoint: CustomEndpoint): Promise<void>;
}

export interface ProvidersModule {
  scope(agentId: string): string;
  refresh(agentId: string): Promise<void>;
  refreshStatus(agentId: string): Promise<void>;
  login(
    agentId: string,
    provider: ProviderId,
    opts?: LoginOptions,
  ): Promise<LoginInfo>;
  cancelLogin(agentId: string, provider: ProviderId): Promise<void>;
  completeLogin(
    agentId: string,
    provider: ProviderId,
    code: string,
  ): Promise<void>;
  setApiKey(agentId: string, provider: ProviderId, key: string): Promise<void>;
  logout(agentId: string, provider: ProviderId): Promise<void>;
  setModel(agentId: string, opts: SetModelOptions): Promise<void>;
  writes: ProvidersWrites;
  credentials: ProviderCredentialWrites;
}
