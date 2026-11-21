import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/runtime-client";
import { SdkHttpError } from "../http";

export type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/runtime-client";

export class IntegrationsHttpError extends SdkHttpError {
  constructor(message: string, status: number) {
    super(message, status, "IntegrationsHttpError");
  }
}

export const INTEGRATIONS_SCOPE = "integrations";

export type IntegrationsUnavailableReason = "unavailable" | "signin";

export interface IntegrationsViewModel {
  loaded: boolean;
  ready: boolean;
  reason?: IntegrationsUnavailableReason;
  toolkits: IntegrationToolkit[];
  connections: IntegrationConnection[];
}

export const IntegrationsCommand = {
  Refresh: "integrations/refresh",
  Connect: "integrations/connect",
  PollConnection: "integrations/pollConnection",
  Disconnect: "integrations/disconnect",
} as const;

export type IntegrationsCommandType =
  (typeof IntegrationsCommand)[keyof typeof IntegrationsCommand];

export function unavailableVm(
  reason: IntegrationsUnavailableReason | undefined,
  loaded: boolean,
): IntegrationsViewModel {
  const vm: IntegrationsViewModel = {
    loaded,
    ready: false,
    toolkits: [],
    connections: [],
  };
  if (reason) vm.reason = reason;
  return vm;
}
