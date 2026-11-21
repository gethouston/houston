import type { Capabilities, OrgBilling } from "@houston/engine-adapter";
import { canSeeOrganization } from "../components/organization/org-view-model.ts";
import { apiKeysSupported } from "./api-keys-model.ts";
import type { AssistantDiscovery } from "./assistant-discovery-state.ts";
import { canSeeBillingTab } from "./billing-gates.ts";
import {
  canDeleteWorkspace,
  canSeeAiModelsPage,
  isSpaceOwner,
} from "./org-roles.ts";

export interface SurfaceGates {
  showOrganization: boolean;
  showBilling: boolean;
  showWorkspaceDanger: boolean;
  manageWorkspaceSkills: boolean;
  showAiModels: boolean;
  showApiKeys: boolean;
  showAssistant: boolean;
  ready: boolean;
}

export interface SurfaceGateInputs {
  capabilities: Capabilities | null | undefined;
  capabilitiesLoading: boolean;
  isTeam: boolean;
  assistant: AssistantDiscovery;
  orgBilling?: OrgBilling | null;
}

export function surfaceGatesFor(inputs: SurfaceGateInputs): SurfaceGates {
  const { capabilities, capabilitiesLoading, isTeam, assistant, orgBilling } =
    inputs;
  return {
    showOrganization: canSeeOrganization(capabilities, isTeam),
    showBilling: canSeeBillingTab(capabilities, orgBilling),
    showWorkspaceDanger:
      capabilities?.workspaceDelete === true &&
      isTeam &&
      canDeleteWorkspace(capabilities),
    showAiModels: canSeeAiModelsPage(capabilities),
    showApiKeys: apiKeysSupported(capabilities ?? null),
    manageWorkspaceSkills:
      !capabilitiesLoading && isSpaceOwner(capabilities, isTeam),
    showAssistant: !assistant.unavailable,
    ready: !capabilitiesLoading,
  };
}
