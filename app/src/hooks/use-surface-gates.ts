import { isTeamWorkspace } from "../lib/space-id.ts";
import {
  type SurfaceGates,
  surfaceGatesFor,
} from "../lib/surface-gates-model.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useActiveOrgBilling } from "./queries/use-billing.ts";
import { useAssistant } from "./use-assistant.ts";
import { useCapabilities } from "./use-capabilities.ts";

export type { SurfaceGates } from "../lib/surface-gates-model.ts";

export function useSurfaceGates(): SurfaceGates {
  const { capabilities, isLoading } = useCapabilities();
  const assistant = useAssistant();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const { billing } = useActiveOrgBilling();
  return surfaceGatesFor({
    capabilities,
    capabilitiesLoading: isLoading,
    isTeam: currentWorkspace ? isTeamWorkspace(currentWorkspace.id) : false,
    assistant,
    orgBilling: billing,
  });
}
