import { canSeeOrganization } from "../components/organization/org-view-model.ts";
import { canSeeAiModelsPage, isSpaceOwner } from "../lib/org-roles.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useCapabilities } from "./use-capabilities.ts";

/** The Teams gates that decide which non-agent surfaces this caller can reach. */
export interface SurfaceGates {
  /**
   * Admin, the lead row of the rail's "Workspace" band. Multiplayer owner/admin
   * only, and on a C8 Spaces host only while the ACTIVE space is a team (a
   * personal space has single-player semantics: non-invitable, no roster, no
   * policy).
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
   * The Skills library, in the rail's "Workspace" run. Skills are what every
   * agent in the space can do, so editing them edits everyone's agents at once:
   * that belongs to whoever OWNS the space (`isSpaceOwner`), not to the manager
   * who runs it and not to a member who uses it. A RAIL gate only — nothing
   * bounces a caller out of the screen, because the gateway is the enforcer and
   * a hidden nav row is the whole of the claim being made here.
   */
  showSkills: boolean;
  /**
   * False while the capabilities the gates read are still loading. Every flag
   * above is computed from `capabilities`, which is `null` until the
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
    showSkills: isSpaceOwner(capabilities, isTeam),
    ready: !isLoading,
  };
}
