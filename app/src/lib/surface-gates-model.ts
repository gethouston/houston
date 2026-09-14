import type { Capabilities } from "@houston-ai/engine-client";
import { canSeeOrganization } from "../components/organization/org-view-model.ts";
import type { AssistantDiscovery } from "./assistant-discovery-state.ts";
import { canSeeAiModelsPage, isSpaceOwner } from "./org-roles.ts";

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
   * The AI Manager, the rail's lead row and a screen of its own. Not a role
   * gate: it asks whether this deployment HOLDS an assistant at all
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

/** Everything the gates are computed from — no hooks, no queries, no DOM. */
export interface SurfaceGateInputs {
  capabilities: Capabilities | null | undefined;
  /** True until the capabilities fetch resolves. */
  capabilitiesLoading?: boolean;
  /** Whether the ACTIVE workspace is a team space. */
  isTeam: boolean;
  assistant: AssistantDiscovery;
}

/**
 * The gate composition itself, kept free of React so each rule is unit-tested
 * against plain capability objects. `useSurfaceGates` is the live binding.
 */
export function surfaceGatesFor(inputs: SurfaceGateInputs): SurfaceGates {
  const { capabilities, capabilitiesLoading, isTeam, assistant } = inputs;
  return {
    showOrganization: canSeeOrganization(capabilities, isTeam),
    showAiModels: canSeeAiModelsPage(capabilities),
    showSkills: isSpaceOwner(capabilities, isTeam),
    showAssistant: !assistant.unavailable,
    // Discovery stays OUT of `ready`: an unanswered discovery keeps
    // `showAssistant` true, so the guard has nothing to bounce, and a slow or
    // failing pod must not hold every other gate's verdict for the wait.
    ready: !capabilitiesLoading,
  };
}
