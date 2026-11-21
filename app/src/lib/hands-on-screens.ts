import type { Agent, Capabilities } from "@houston/engine-adapter";
import {
  type HandsOnSurface,
  type InteractionStep,
  isHandsOnSurface,
} from "@houston/protocol/interaction-types";
import { canOpenAgentSettings } from "./agent-nav.ts";
import type { RosterLoadState } from "./roster-settled.ts";

const SCREEN_KEYS = {
  apiKeys: "interaction.handsOnScreens.apiKeys",
  billing: "interaction.handsOnScreens.billing",
  files: "interaction.handsOnScreens.files",
  routineWebhook: "interaction.handsOnScreens.routineWebhook",
  orgDanger: "interaction.handsOnScreens.orgDanger",
  agentApiAccess: "interaction.handsOnScreens.agentApiAccess",
} as const satisfies Record<HandsOnSurface, string>;

export function handsOnScreenKey(
  surface: HandsOnSurface,
): (typeof SCREEN_KEYS)[HandsOnSurface] {
  return SCREEN_KEYS[surface];
}

export type HandsOnAgentTarget =
  | { kind: "pending" }
  | { kind: "absent" }
  | { kind: "found"; agent: Pick<Agent, "id" | "name" | "access"> };

export function resolveHandsOnAgent(
  agentId: string | undefined,
  roster: RosterLoadState & {
    agents: readonly Pick<Agent, "id" | "name" | "access">[];
  },
): HandsOnAgentTarget {
  if (!agentId) return { kind: "absent" };
  const agent = roster.agents.find((a) => a.id === agentId);
  if (agent) return { kind: "found", agent };
  return roster.loaded && !roster.loading
    ? { kind: "absent" }
    : { kind: "pending" };
}

export function handsOnAgentSettings(
  target: HandsOnAgentTarget,
  caps: Capabilities | null | undefined,
): boolean | undefined {
  if (target.kind === "pending") return undefined;
  if (target.kind === "absent") return false;
  return canOpenAgentSettings(caps, target.agent);
}

export type HandsOnScreenLabel =
  | { key: "interaction.handsOnUnknownScreen" }
  | { key: (typeof SCREEN_KEYS)[HandsOnSurface] }
  | { key: "interaction.handsOnAgentApiAccessFor"; name: string };

export function handsOnScreenLabel(
  step: { surface: string; agentId?: string },
  agentName: (id: string) => string | undefined,
): HandsOnScreenLabel {
  if (!isHandsOnSurface(step.surface))
    return { key: "interaction.handsOnUnknownScreen" };
  const name =
    step.surface === "agentApiAccess" && step.agentId
      ? agentName(step.agentId)
      : undefined;
  return name
    ? { key: "interaction.handsOnAgentApiAccessFor", name }
    : { key: handsOnScreenKey(step.surface) };
}

export function apiKeyNameAgentId(
  steps: readonly InteractionStep[],
): string | undefined {
  for (const step of steps)
    if (
      step.kind === "hands_on" &&
      step.surface === "agentApiAccess" &&
      step.agentId
    )
      return step.agentId;
  return undefined;
}

export type InlineHandsOn = "apiKey" | "agentApi";

export function inlineHandsOn(
  surface: string,
  managerChat: boolean,
): InlineHandsOn | null {
  if (!managerChat) return null;
  if (surface === "apiKeys") return "apiKey";
  if (surface === "agentApiAccess") return "agentApi";
  return null;
}

export function handsOnManagerOnly(surface: string): boolean {
  return surface === "agentApiAccess";
}
