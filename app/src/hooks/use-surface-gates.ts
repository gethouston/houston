import { isTeamWorkspace } from "../lib/space-id.ts";
import {
  type SurfaceGates,
  surfaceGatesFor,
} from "../lib/surface-gates-model.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useAssistant } from "./use-assistant.ts";
import { useCapabilities } from "./use-capabilities.ts";

export type { SurfaceGates } from "../lib/surface-gates-model.ts";

/**
 * The single source of the surface gates. The sidebar (which nav items exist),
 * the workspace shell (which top-level view may render) and the footer
 * (which gated rows it draws) all read the same booleans from here, so a gate can
 * never be tightened in one place and forgotten in another. `ready` says whether
 * they mean anything yet.
 *
 * Cosmetic only: the gateway is the real enforcer. These just hide affordances
 * the caller could not act on. The rules themselves live in
 * `lib/surface-gates-model.ts`, where they are unit-tested without React.
 */
export function useSurfaceGates(): SurfaceGates {
  const { capabilities, isLoading } = useCapabilities();
  const assistant = useAssistant();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  return surfaceGatesFor({
    capabilities,
    capabilitiesLoading: isLoading,
    isTeam: currentWorkspace ? isTeamWorkspace(currentWorkspace.id) : false,
    assistant,
  });
}
