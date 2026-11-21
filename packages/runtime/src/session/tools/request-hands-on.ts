import { defineTool } from "@earendil-works/pi-coding-agent";
import type { HandsOnSurface } from "@houston/protocol";
import { HANDS_ON_SURFACES, isHandsOnSurface } from "@houston/protocol";
import { Type } from "typebox";
import { houstonApiServedHere } from "../houston-api-served";
import { recordHandsOn } from "../interaction";
import { assertNotPlanMode } from "../live-mode-gate";

export const REQUEST_HANDS_ON_TOOL_NAME = "request_hands_on";

const ACCOUNT_OWNER_SURFACES: ReadonlySet<HandsOnSurface> = new Set([
  "billing",
  "orgDanger",
]);

const AGENT_SURFACES: ReadonlySet<HandsOnSurface> = new Set(["agentApiAccess"]);

export interface RequestHandsOnToolOptions {
  personalAssistant: boolean;
  apiServed?: boolean;
}

export function makeRequestHandsOnTool({
  personalAssistant,
  apiServed = houstonApiServedHere(),
}: RequestHandsOnToolOptions) {
  const agentScreens = personalAssistant && apiServed;
  const offered = HANDS_ON_SURFACES.filter((surface) =>
    AGENT_SURFACES.has(surface)
      ? agentScreens
      : personalAssistant || !ACCOUNT_OWNER_SURFACES.has(surface),
  );
  const surfaceList = offered.join(", ");
  const errands = personalAssistant
    ? agentScreens
      ? "pay or change a plan, copy a key the app shows once, pick files from their device, copy a routine's webhook, destroy a shared space, or connect one AI Employee to their own code or another AI assistant (apiKeys lets them create and copy a key right in the chat, and you never see it; agentApiAccess shows that employee's Agent ID, Organization ID and a ready setup prompt for an AI coding assistant right in the chat; pass the employee's id from listAgents as agent)"
      : "pay or change a plan, copy a key the app shows once, pick files from their device, copy a routine's webhook, or destroy a shared space"
    : "copy a key the app shows once, pick files from their device, or copy a routine's webhook";
  return defineTool({
    name: REQUEST_HANDS_ON_TOOL_NAME,
    label: "Hand an app screen to the user",
    description: `Send the user to a screen in the app to finish something only they can do there: ${errands}. The app shows a card that opens the screen for them${agentScreens ? " (or, for apiKeys and agentApiAccess, does the job right in the chat)" : ""} and asks them to confirm when they are finished. Valid screens: ${surfaceList}. Never describe the clicks in chat and never ask them to paste a secret into the conversation. Queue the card, finish independent work, then end your turn.`,
    parameters: Type.Object({
      surface: Type.String(),
      agent: Type.Optional(
        Type.String({
          description:
            "The AI Employee's id from listAgents. Required for agentApiAccess; ignored for every other screen.",
        }),
      ),
      reason: Type.Optional(Type.String()),
    }),
    executionMode: "sequential",
    async execute(
      _id: string,
      params: { surface: string; agent?: string; reason?: string },
    ) {
      assertNotPlanMode("hand a screen to the user");
      const surface = params.surface.trim();
      if (!isHandsOnSurface(surface))
        throw new Error(
          `The app has no '${params.surface}' screen to hand over. Use one of: ${surfaceList}.`,
        );
      if (!personalAssistant && ACCOUNT_OWNER_SURFACES.has(surface))
        throw new Error(
          `The '${surface}' screen is the user's own to open, not yours to hand over. Say what you need and why in your reply and let them decide. Screens you may hand over: ${surfaceList}.`,
        );
      if (!personalAssistant && AGENT_SURFACES.has(surface))
        throw new Error(
          `The '${surface}' screen belongs to one AI Employee, and only the user's AI Manager can look up which. Point them to their AI Manager in your reply. Screens you may hand over: ${surfaceList}.`,
        );
      if (!apiServed && AGENT_SURFACES.has(surface))
        throw new Error(
          `This app does not offer the Houston API, so there is no '${surface}' screen to hand over. Screens you may hand over: ${surfaceList}.`,
        );
      const agentId = AGENT_SURFACES.has(surface)
        ? params.agent?.trim()
        : undefined;
      if (AGENT_SURFACES.has(surface) && !agentId)
        throw new Error(
          `The '${surface}' screen belongs to one AI Employee: pass that employee's id from listAgents as agent. Ask the user which employee they mean if you cannot tell.`,
        );
      const reason = params.reason?.trim();
      recordHandsOn({
        surface,
        ...(agentId ? { agentId } : {}),
        ...(reason ? { reason } : {}),
      });
      return {
        content: [
          {
            type: "text" as const,
            text: "The card was queued. End your turn after any independent work; you get a message once the user says they finished it, or that they skipped it.",
          },
        ],
        details: { surface, ...(agentId ? { agentId } : {}) },
      };
    },
  });
}
