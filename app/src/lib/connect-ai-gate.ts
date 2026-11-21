import type { Capabilities } from "@houston/engine-adapter";
import {
  type PickerEmptyState,
  pickerEmptyState,
} from "../components/chat-model-selector-labels.ts";
import {
  providerConnectionCounts,
  shouldReplaceComposerWithConnectAi,
} from "./composer-connect-ai.ts";
import type { ProviderConnectionStatus } from "./provider-connection.ts";

export interface ConnectAiGateInput {
  statuses: Record<string, ProviderConnectionStatus>;
  statusesLoading: boolean;
  statusesError: boolean;
  catalogReady: boolean;
  capabilities: Capabilities | null;
  capabilitiesLoaded: boolean;
  teamSpace: boolean;
}

export interface ConnectAiGateState {
  active: boolean;
  variant: PickerEmptyState;
  canConnect: boolean;
}

export function connectAiGateState(
  input: ConnectAiGateInput,
): ConnectAiGateState {
  const { variant, canConnect } = pickerEmptyState({
    teamSpace: input.teamSpace,
    capabilities: input.capabilities,
    capabilitiesLoaded: input.capabilitiesLoaded,
  });
  const active = shouldReplaceComposerWithConnectAi({
    ...providerConnectionCounts(input.statuses),
    statusesLoading: input.statusesLoading,
    statusesError: input.statusesError,
    catalogReady: input.catalogReady,
    capabilitiesLoaded: input.capabilitiesLoaded,
  });
  return { active, variant, canConnect };
}
