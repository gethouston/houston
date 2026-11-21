import { managerReachable } from "../../lib/manager-reachable.ts";
import { blockedAgentView } from "../../lib/teams-model.ts";
import {
  AGENTS_HOME_VIEW_ID,
  blockedTopLevelView,
  isTopLevelView,
} from "../../lib/top-level-views.ts";
import type { Agent } from "../../lib/types.ts";

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

export function shouldDropAdminPin(gates: {
  ready: boolean;
  showOrganization: boolean;
}): boolean {
  return gates.ready && !gates.showOrganization;
}

export function deadViewStep(input: {
  viewMode: string;
  showAiModels: boolean;
  showAssistant: boolean;
  onboardingActive: boolean;
  showOrganization: boolean;
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
    showAssistant: managerReachable(input),
    showOrganization: input.showOrganization,
  });
  if (gateDead && !input.gatesReady) return "wait";
  const dead = !isTopLevelView(input.viewMode) || gateDead || agentDead;
  if (!dead) return "keep";
  if (agentDead && !input.agentsReady) return "wait";
  return "go-home";
}
