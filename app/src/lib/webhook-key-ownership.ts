import type { Capabilities } from "@houston/engine-adapter";
import { isSpaceOwner } from "./org-roles";
import { isTeamWorkspace } from "./space-id";

export function webhookKeyOwnership(input: {
  capabilities: Capabilities | null;
  capabilitiesLoading: boolean;
  workspaceId: string | null;
}): boolean | undefined {
  if (input.capabilitiesLoading || !input.capabilities || !input.workspaceId)
    return undefined;
  return isSpaceOwner(input.capabilities, isTeamWorkspace(input.workspaceId));
}
