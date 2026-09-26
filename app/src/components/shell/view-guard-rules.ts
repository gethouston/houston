import { blockedAgentView } from "../../lib/teams-model.ts";
import {
  AGENTS_HOME_VIEW_ID,
  blockedTopLevelView,
  isTopLevelView,
} from "../../lib/top-level-views.ts";
import type { Agent } from "../../lib/types.ts";

/** Where the user stood when the space changed: still there = not a choice. */
export interface OutgoingView {
  viewMode: string;
  activeAgentId: string | null;
}

export type BootGuardState =
  | { kind: "unseen" }
  | { kind: "resolving"; workspaceId: string | null; outgoing?: OutgoingView }
  | { kind: "done"; workspaceId: string | null };

export const INITIAL_BOOT_GUARD: BootGuardState = { kind: "unseen" };

export type BootLanding =
  | { kind: "resolving" }
  | { kind: "opening-agent"; agentId: string }
  | { kind: "done" };

export type BootGuardAction =
  | { kind: "wait" }
  | { kind: "open-agent"; agentId: string };

export interface BootGuardInput {
  workspaceId: string | null;
  viewMode: string;
  agentsHomeAgentId: string | null;
  activeAgentId: string | null;
  isMobile: boolean;
  agentsReady: boolean;
  layoutReady: boolean;
  firstAgentId: string | null;
}

/** A space change arms first; its outgoing view must not disarm the new space. */
export function bootGuardStep(
  state: BootGuardState,
  input: BootGuardInput,
): { state: BootGuardState; action: BootGuardAction; landing: BootLanding } {
  if (state.kind !== "unseen" && state.workspaceId !== input.workspaceId) {
    return {
      state: {
        kind: "resolving",
        workspaceId: input.workspaceId,
        outgoing: {
          viewMode: input.viewMode,
          activeAgentId: input.activeAgentId,
        },
      },
      action: { kind: "wait" },
      landing: input.isMobile ? { kind: "done" } : { kind: "resolving" },
    };
  }
  if (state.kind === "done")
    return { state, action: { kind: "wait" }, landing: { kind: "done" } };
  const outgoingView =
    state.kind === "resolving" &&
    state.outgoing?.viewMode === input.viewMode &&
    state.outgoing.activeAgentId === input.activeAgentId;
  if (
    input.isMobile ||
    (!outgoingView &&
      (input.viewMode !== AGENTS_HOME_VIEW_ID ||
        input.agentsHomeAgentId !== null))
  ) {
    return {
      state: { kind: "done", workspaceId: input.workspaceId },
      action: { kind: "wait" },
      landing: { kind: "done" },
    };
  }
  if (!input.agentsReady || (input.firstAgentId !== null && !input.layoutReady))
    return {
      // The same object while nothing changed: the caller holds it as React
      // state, and a fresh one per render would never settle.
      state:
        state.kind === "resolving"
          ? state
          : { kind: "resolving", workspaceId: input.workspaceId },
      action: { kind: "wait" },
      landing: { kind: "resolving" },
    };
  if (input.firstAgentId === null)
    return {
      state: { kind: "done", workspaceId: input.workspaceId },
      action: { kind: "wait" },
      landing: { kind: "done" },
    };
  return {
    state: { kind: "done", workspaceId: input.workspaceId },
    action: { kind: "open-agent", agentId: input.firstAgentId },
    landing: { kind: "opening-agent", agentId: input.firstAgentId },
  };
}

export type DeadViewAction = "keep" | "wait" | "go-home";

/** A closed, settled organization gate cannot honor a pending Admin tab. */
export function shouldDropAdminPin(gates: {
  ready: boolean;
  showOrganization: boolean;
}): boolean {
  return gates.ready && !gates.showOrganization;
}

/**
 * Whether the open view still exists — and, when it does not, whether that is
 * genuinely stale or merely in flight.
 *
 * A `viewMode` no screen answers to, a view this caller's gates hide (the
 * shared Skills library for anyone but the space's owner, Admin below its
 * organization gate, the assistant on a deployment that serves none), or an employee that stopped existing under an
 * open employee view all fall through every render branch and strand the user on a
 * blank card. Those go home.
 *
 * A GATED view whose gates have not resolved yet WAITS. The gates are computed
 * from `capabilities` and from assistant discovery, both null until their
 * fetches land, so every one of them reads false in that window: acting on it would bounce a user off the very
 * screen they persisted, on every boot and every space switch — and a team-space
 * switch drops the capabilities query outright, so the window is deterministic
 * rather than theoretical.
 *
 * A missing employee view waits for this workspace's roster read before
 * deciding whether the employee still exists. An unknown view mode has no
 * such dependency.
 */
export function deadViewStep(input: {
  viewMode: string;
  showAiModels: boolean;
  showAssistant: boolean;
  showSkills: boolean;
  showOrganization: boolean;
  /** False while the capabilities behind the gates are still loading. */
  gatesReady: boolean;
  agentsReady: boolean;
  activeAgentId: string | null;
  agents: readonly Agent[];
}): DeadViewAction {
  const agentDead = blockedAgentView(
    input.viewMode,
    input.activeAgentId,
    input.agents,
  );
  const gateDead = blockedTopLevelView(input.viewMode, {
    showAiModels: input.showAiModels,
    showAssistant: input.showAssistant,
    showSkills: input.showSkills,
    showOrganization: input.showOrganization,
  });
  if (gateDead && !input.gatesReady) return "wait";
  const dead = !isTopLevelView(input.viewMode) || gateDead || agentDead;
  if (!dead) return "keep";
  if (agentDead && !input.agentsReady) return "wait";
  return "go-home";
}
