import type { Capabilities } from "@houston/engine-adapter";
import { canSeeOrganization } from "../components/organization/org-view-model.ts";
import type { AssistantDiscovery } from "./assistant-discovery-state.ts";
import { canSeeBillingTab } from "./billing-gates.ts";
import {
  canDeleteWorkspace,
  canSeeAiModelsPage,
  isSpaceOwner,
} from "./org-roles.ts";

/** The Teams gates that decide which non-agent surfaces this caller can reach. */
export interface SurfaceGates {
  /**
   * The Admin rail row and top-level dashboard. Multiplayer owner/admin can
   * reach it, as can the caller in a Spaces personal space. Other callers
   * see no row and an open Admin view returns home.
   */
  showOrganization: boolean;
  /**
   * The Billing section INSIDE Admin: a Spaces host, a team space, and
   * owner/admin (`canSeeBillingTab`). Read it together with
   * {@link showOrganization}, which decides whether Admin renders at all.
   */
  showBilling: boolean;
  /**
   * The Danger zone, a block on the Settings index rather than a screen of its
   * own: a deployment that can delete a space at all, an active space that is a
   * team, and an owner. Everyone else opens Settings to find nothing there,
   * which is why anything that SENDS a person to the Danger zone asks this
   * first.
   */
  showWorkspaceDanger: boolean;
  /**
   * The AI Models hub holds each caller's connected accounts and usage
   * (HOU-789). Every caller can reach their own accounts.
   */
  showAiModels: boolean;
  /**
   * The shared Skills library: its rail row and the screen behind it. Skills
   * are what every agent in the space can do, so editing them edits everyone's
   * agents at once: that belongs to whoever OWNS the space (`isSpaceOwner`),
   * not to the manager who runs it and not to a member who uses it. A caller
   * without it has no row and no screen, and a `viewMode` left on the library
   * when the gate closes goes home (`blockedTopLevelView`). The gateway is the
   * enforcer; a hidden row is the whole of the claim being made here.
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
  /** True until the capabilities fetch resolves. Required: every flag is read
   *  off `capabilities`, so a caller that omitted it silently declared the
   *  gates SETTLED while they were still unknown. */
  capabilitiesLoading: boolean;
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
    showBilling: canSeeBillingTab(capabilities, isTeam),
    showWorkspaceDanger:
      capabilities?.workspaceDelete === true &&
      isTeam &&
      canDeleteWorkspace(capabilities),
    showAiModels: canSeeAiModelsPage(capabilities),
    showSkills: isSpaceOwner(capabilities, isTeam),
    showAssistant: !assistant.unavailable,
    // Discovery stays OUT of `ready`: an unanswered discovery keeps
    // `showAssistant` true, so the guard has nothing to bounce, and a slow or
    // failing pod must not hold every other gate's verdict for the wait.
    ready: !capabilitiesLoading,
  };
}
