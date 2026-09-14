import { canSeeOrganization } from "../components/organization/org-view-model.ts";
import { canSeeAiModelsPage, isSpaceOwner } from "../lib/org-roles.ts";
import { isTeamWorkspace } from "../lib/space-id.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useAssistant } from "./use-assistant.ts";
import { useCapabilities } from "./use-capabilities.ts";

/** The Teams gates that decide which non-agent surfaces this caller can reach. */
export interface SurfaceGates {
  /**
   * Admin, the lead row of the rail's "Workspace" band. Multiplayer owner/admin
   * only on a non-spaces multiplayer host. A C8 Spaces personal space also
   * shows Admin because its sole caller owns that space.
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
   * The personal assistant, the rail's lead row and a screen of its own. Not a
   * role gate: it asks whether this deployment HOLDS an assistant at all
   * (`useAssistant`), which only discovery can answer. The row is up from the
   * first paint and comes down only once discovery has SETTLED that none
   * exists: nearly every deployment serves one, and the user opens the app to
   * talk to it, so the address arriving a beat later is the screen's wait
   * (its spinner), never the rail's. A deployment that serves none answers
   * absence at once (a 501/404, no pod to wait on), so the row is gone before
   * it is read.
   */
  showAssistant: boolean;
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
  const assistant = useAssistant();
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const isTeam = currentWorkspace
    ? isTeamWorkspace(currentWorkspace.id)
    : false;
  return {
    showOrganization: canSeeOrganization(capabilities, isTeam),
    showAiModels: canSeeAiModelsPage(capabilities),
    showSkills: isSpaceOwner(capabilities, isTeam),
    showAssistant: !assistant.unavailable,
    // Discovery stays OUT of `ready`: an unanswered discovery keeps
    // `showAssistant` true, so the guard has nothing to bounce, and a slow or
    // failing pod must not hold every other gate's verdict for the wait.
    ready: !isLoading,
  };
}
