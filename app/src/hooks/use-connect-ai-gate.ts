import { useCallback } from "react";
import {
  type ConnectAiGateState,
  connectAiGateState,
} from "../lib/connect-ai-gate.ts";
import type { ProviderConnectionStatus } from "../lib/provider-connection.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { AI_HUB_VIEW_ID } from "../lib/top-level-views.ts";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";
import { useProviderCatalog } from "./use-provider-catalog";
import { useProviderStatuses } from "./use-provider-statuses";

export interface ConnectAiGate extends ConnectAiGateState {
  connect: () => void;
}

export interface ConnectAiScan {
  statuses: Record<string, ProviderConnectionStatus>;
  isLoading: boolean;
  isError: boolean;
}

export function useConnectAiDecision(scan: ConnectAiScan): ConnectAiGate {
  const { capabilities, isLoading: capabilitiesLoading } = useCapabilities();
  const { isReady: catalogReady } = useProviderCatalog();
  const workspaceId = useWorkspaceStore((s) => s.current?.id ?? null);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const state = connectAiGateState({
    statuses: scan.statuses,
    statusesLoading: scan.isLoading,
    statusesError: scan.isError,
    catalogReady,
    capabilities,
    capabilitiesLoaded: !capabilitiesLoading,
    teamSpace: workspaceId ? isTeamWorkspace(workspaceId) : false,
  });
  const connect = useCallback(() => setViewMode(AI_HUB_VIEW_ID), [setViewMode]);
  return { ...state, connect };
}

export function useConnectAiGate(): ConnectAiGate {
  return useConnectAiDecision(useProviderStatuses());
}
