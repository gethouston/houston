import { canSeeOrganization } from "../components/organization/org-view-model.ts";
import { showComputeSection } from "../components/time-worked/compute-usage-model.ts";
import { canSeeAiModelsPage } from "../lib/org-roles.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useCapabilities } from "./use-capabilities.ts";

/** The Teams gates that decide which non-agent surfaces this caller can reach. */
export interface SurfaceGates {
  /**
   * Admin + Permissions. Multiplayer owner/admin only, and on a C8 Spaces host
   * only while the ACTIVE space is a team (a personal space has single-player
   * semantics: non-invitable, no roster, no policy).
   */
  showOrganization: boolean;
  /**
   * The AI Models hub, which is also where each connected account's usage lives
   * (HOU-789). In a Teams workspace it is owner/admin territory (provider
   * credentials are org-level), so plain members lose it; everyone else keeps
   * it.
   */
  showAiModels: boolean;
  /**
   * Settings > Time worked. Only a deployment that meters how long agents run
   * (`capabilities.computeUsage`, hosted cloud only) has anything to show, and
   * the screen holds nothing else, so everywhere else must not offer it.
   */
  showTimeWorked: boolean;
  /**
   * False while the capabilities the gates read are still loading. All three
   * flags above are computed from `capabilities`, which is `null` until the
   * fetch resolves, so an unresolved gate is indistinguishable from a denied
   * one.
   * Anything that DROPS a surface on a false gate (rather than merely hiding an
   * affordance it can re-show) must wait for this. Hiding a nav row early is
   * harmless; dumping an owner out of an open screen is not.
   */
  ready: boolean;
}

/**
 * The single source of the surface gates. The sidebar (which nav items exist),
 * the workspace shell (which top-level view may render) and the Settings index
 * (which sections exist) all read the same booleans from here, so a gate can
 * never be tightened in one place and forgotten in another. `ready` says whether
 * they mean anything yet.
 *
 * Cosmetic only: the gateway is the real enforcer. These just hide affordances
 * the caller could not act on.
 */
export function useSurfaceGates(): SurfaceGates {
  const { capabilities, isLoading } = useCapabilities();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const isTeam = currentWorkspace
    ? isTeamWorkspace(currentWorkspace.id)
    : false;
  return {
    showOrganization: canSeeOrganization(capabilities, isTeam),
    showAiModels: canSeeAiModelsPage(capabilities),
    showTimeWorked: showComputeSection(capabilities),
    ready: !isLoading,
  };
}
