import type { CustomEndpoint } from "@houston/runtime-client";
import type { ModuleContext } from "../../module-context";
import { moduleScope, SdkHttpError } from "../http";
import {
  captureCredential,
  forgetCredential,
  pushClaudeOAuthCredential,
  setApiKey,
  setCustomEndpoint,
} from "./credentials";
import {
  captureSetupCredential,
  forgetSetupCredential,
  pushSetupClaudeOAuthCredential,
  setSetupApiKey,
} from "./setup-credentials";

export class ProvidersHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "ProvidersHttpError");
  }
}

export interface ProviderCredentialWrites {
  captureCredential(agentId: string, provider?: string): Promise<void>;
  pushClaudeOAuthCredential(
    agentId: string,
    credentialJson: string,
  ): Promise<void>;
  forgetCredential(agentId: string, provider: string): Promise<void>;
  setApiKey(
    agentId: string,
    provider: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void>;
  setCustomEndpoint(agentId: string, endpoint: CustomEndpoint): Promise<void>;
  pushSetupClaudeOAuthCredential(credentialJson: string): Promise<void>;
  captureSetupCredential(provider?: string): Promise<void>;
  setSetupApiKey(
    provider: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void>;
  forgetSetupCredential(provider: string): Promise<void>;
}

export function createProviderCredentials(
  ctx: ModuleContext,
): ProviderCredentialWrites {
  const scope = moduleScope(ctx, "providers", ProvidersHttpError);
  return {
    captureCredential: (agentId, provider) =>
      captureCredential(scope, agentId, provider),
    pushClaudeOAuthCredential: (agentId, credentialJson) =>
      pushClaudeOAuthCredential(scope, agentId, credentialJson),
    forgetCredential: (agentId, provider) =>
      forgetCredential(scope, agentId, provider),
    setApiKey: (agentId, provider, apiKey, endpoint) =>
      setApiKey(scope, agentId, provider, apiKey, endpoint),
    setCustomEndpoint: (agentId, endpoint) =>
      setCustomEndpoint(scope, agentId, endpoint),
    pushSetupClaudeOAuthCredential: (credentialJson) =>
      pushSetupClaudeOAuthCredential(scope, credentialJson),
    captureSetupCredential: (provider) =>
      captureSetupCredential(scope, provider),
    setSetupApiKey: (provider, apiKey, endpoint) =>
      setSetupApiKey(scope, provider, apiKey, endpoint),
    forgetSetupCredential: (provider) => forgetSetupCredential(scope, provider),
  };
}
