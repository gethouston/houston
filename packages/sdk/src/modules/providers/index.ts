import type { ModuleContext } from "../../module-context";
import { createProviderCredentials } from "./credential-store";
import { createProviderOps } from "./operations";
import {
  parseCompleteLogin,
  parseLogin,
  parseProviderAction,
  parseRefresh,
  parseSetApiKey,
  parseSetModel,
} from "./payloads";
import {
  ProvidersCommand,
  type ProvidersModule,
  providersScope,
} from "./types";
import { createProviderWrites } from "./writes";

export {
  type ProviderCredentialWrites,
  ProvidersHttpError,
} from "./credential-store";
export { mergeProviders, overlayStatus } from "./merge";
export {
  nextReconnectNoticeChange,
  type ProviderLoginStatus,
  type ProviderReconnectNotice,
  providerReconnectNotice,
  providerReconnectNotices,
  RECONNECT_NOTICE_DAYS,
} from "./reconnect";
export type {
  AuthStatus,
  CustomEndpoint,
  LoginInfo,
  LoginOptions,
  LoginState,
  ProviderId,
  ProvidersModule,
  ProvidersViewModel,
  ProvidersWrites,
  ProviderVM,
  SetModelOptions,
} from "./types";
export {
  ProvidersCommand,
  type ProvidersCommandType,
  providersScope,
} from "./types";

export function createProvidersModule(ctx: ModuleContext): ProvidersModule {
  const writes = createProviderWrites(ctx);
  const credentials = createProviderCredentials(ctx);
  const ops = createProviderOps(ctx, writes);

  ctx.registerCommand(ProvidersCommand.Refresh, (p) =>
    ops.refresh(parseRefresh(p).agentId),
  );
  ctx.registerCommand(ProvidersCommand.RefreshStatus, (p) =>
    ops.refreshStatus(parseRefresh(p).agentId),
  );
  ctx.registerCommand(ProvidersCommand.Login, (p) => {
    const { agentId, provider, deviceAuth, enterpriseDomain } = parseLogin(p);
    return ops.login(agentId, provider, { deviceAuth, enterpriseDomain });
  });
  ctx.registerCommand(ProvidersCommand.CancelLogin, (p) => {
    const { agentId, provider } = parseProviderAction(p);
    return ops.cancelLogin(agentId, provider);
  });
  ctx.registerCommand(ProvidersCommand.CompleteLogin, (p) => {
    const { agentId, provider, code } = parseCompleteLogin(p);
    return ops.completeLogin(agentId, provider, code);
  });
  ctx.registerCommand(ProvidersCommand.SetApiKey, (p) => {
    const { agentId, provider, key } = parseSetApiKey(p);
    return ops.setApiKey(agentId, provider, key);
  });
  ctx.registerCommand(ProvidersCommand.Logout, (p) => {
    const { agentId, provider } = parseProviderAction(p);
    return ops.logout(agentId, provider);
  });
  ctx.registerCommand(ProvidersCommand.SetModel, (p) => {
    const { agentId, model, effort, provider } = parseSetModel(p);
    return ops.setModel(agentId, { model, effort, provider });
  });

  return { scope: providersScope, ...ops, writes, credentials };
}
