import { resetIntegrationGateForIdentityChange } from "../components/integrations/integrations-gate-state";
import { useLinkedInPosts } from "../components/organization/linkedin-post-store";
import { useAgentProvisioningStore } from "../stores/agent-provisioning";
import { useAgentStore } from "../stores/agents";
import { useDraftStore } from "../stores/drafts";
import { useInteractionDraftStore } from "../stores/interaction-drafts";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { sliceCoverage } from "./all-conversations-coverage";
import { citationsFacade } from "./citations-facade";
import { isEngineReady, setActiveOrg } from "./engine";
import { resetQueryCacheForIdentityChange } from "./identity-cache-reset";
import { resetPlanSessionForIdentityChange } from "./plan-session";
import { queryClient } from "./query-client";

export function resetForIdentityChange(): void {
  resetQueryCacheForIdentityChange(queryClient);
  resetIntegrationGateForIdentityChange();
  resetPlanSessionForIdentityChange();
  useAgentStore.getState().reset();
  useWorkspaceStore.getState().reset();
  useUIStore.getState().reset();
  useDraftStore.getState().reset();
  if (isEngineReady()) citationsFacade.module().clearAll();
  useInteractionDraftStore.getState().reset();
  useAgentProvisioningStore.getState().reset();
  useLinkedInPosts.getState().reset();
  sliceCoverage.reset();
  setActiveOrg(null);
}
