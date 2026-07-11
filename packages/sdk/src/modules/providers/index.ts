/**
 * The providers module — the SDK-canonical per-agent AI-provider connect/status
 * surface (PARITY-SETTINGS §2, §6). One reactive scope per agent
 * (`providers/<agentId>`) holding a {@link ProvidersViewModel} that merges the
 * runtime's `GET /providers` + `GET /auth/status` reads (see `merge.ts`). The
 * read/mutation functions live in `operations.ts`; this factory wires them to
 * the command registry and returns the typed facade — one implementation backs
 * both the facade and the bridge `dispatch` path.
 *
 * Provider credentials are per-agent-pod in hosted mode, so every call is routed
 * through `ctx.clientFor(agentId)` (`/agents/<id>/…`). 401s need no handling
 * here: `ctx.config.ports.fetch` is the shared auth-fetch, which classifies a
 * 401 and reports it to the `session/tokenExpired` notifier for EVERY request it
 * stamps — the engine client the module calls runs on that same fetch, so a
 * lapsed token surfaces automatically (verified, not reimplemented).
 *
 * **Login polling contract.** `login` STARTS an OAuth session and returns the
 * {@link LoginInfo} verbatim; for a `device_code`/`auth_code` login the
 * credential only lands once the user completes it out of band. The SDK owns no
 * timer — the SURFACE polls {@link ProvidersModule.refreshStatus} (the cheap
 * `/auth/status`-only read) on its own cadence and watches the provider's
 * `configured` flip to true (a `device_code` login) or drives
 * {@link ProvidersModule.completeLogin} with the pasted code (an `auth_code`
 * login). The module stays imperative throughout.
 */

import type { ModuleContext } from "../../module-context";
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

export { mergeProviders, overlayStatus } from "./merge";
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

  return { scope: providersScope, ...ops, writes };
}
