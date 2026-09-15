import { defineTool } from "@earendil-works/pi-coding-agent";
import type { HandsOnSurface } from "@houston/protocol";
import { HANDS_ON_SURFACES, isHandsOnSurface } from "@houston/protocol";
import { Type } from "typebox";
import { recordHandsOn } from "../interaction";
import { assertNotPlanMode } from "../live-mode-gate";

export const REQUEST_HANDS_ON_TOOL_NAME = "request_hands_on";

/**
 * The screens that are the person's OWN to open: what they pay and what they
 * can destroy. Every other errand is Houston asking for a hand with work the
 * agent was already given; these two are the person's standing over their
 * money and their space.
 *
 * The card carries a MODEL-AUTHORED reason rendered in Houston's own chrome, so
 * an ordinary mission agent — one that reads web pages, mail and documents all
 * turn — could be talked into dressing a trip to Billing or the Danger zone as
 * Houston's own idea. The AI Manager is the one runtime the HOST itself named
 * to operate the account, which is the same structural line `credentialTools`
 * draws, so it alone may hand these two over.
 */
const ACCOUNT_OWNER_SURFACES: ReadonlySet<HandsOnSurface> = new Set([
  "billing",
  "orgDanger",
]);

export interface RequestHandsOnToolOptions {
  /** True when this runtime IS the user's personal assistant (the AI Manager). */
  personalAssistant: boolean;
}

/**
 * Hand a Houston screen to the person because the work there needs THEIR hands:
 * a card the model must never hold, a secret revealed once in a dialog the app
 * owns, files that exist only on their device, a space they alone may destroy.
 * One card covers all of them — each is the same interaction ("open this
 * screen, do the thing, come back"), and none can carry its result back through
 * the runtime, so four bespoke step kinds would buy nothing.
 *
 * KNOWN DEGRADATION: a build that predates this step kind drops it on the way in
 * (`parsePendingInteraction` keeps only the kinds it recognizes), so the turn
 * ends with nothing on screen. Accepted: the alternative is the model narrating
 * the clicks in chat, which is exactly what this tool exists to replace.
 */
export function makeRequestHandsOnTool({
  personalAssistant,
}: RequestHandsOnToolOptions) {
  const offered = HANDS_ON_SURFACES.filter(
    (surface) => personalAssistant || !ACCOUNT_OWNER_SURFACES.has(surface),
  );
  const surfaceList = offered.join(", ");
  return defineTool({
    name: REQUEST_HANDS_ON_TOOL_NAME,
    label: "Hand a Houston screen to the user",
    description: `Send the user to a Houston screen to finish something only they can do there: ${personalAssistant ? "pay or change a plan, copy a key Houston shows once, pick files from their device, copy a routine's webhook, or destroy a shared space" : "copy a key Houston shows once, pick files from their device, or copy a routine's webhook"}. Houston shows a card that opens the screen for them and asks them to confirm when they are finished. Valid screens: ${surfaceList}. Never describe the clicks in chat and never ask them to paste a secret into the conversation. Queue the card, finish independent work, then end your turn.`,
    parameters: Type.Object({
      surface: Type.String(),
      reason: Type.Optional(Type.String()),
    }),
    executionMode: "sequential",
    async execute(_id: string, params: { surface: string; reason?: string }) {
      assertNotPlanMode("hand a screen to the user");
      const surface = params.surface.trim();
      // Refused HERE, where the model can correct course: a screen the app
      // cannot open renders a card with no way forward, blocking the composer
      // until the user hits Skip (the same lesson as the hidden provider ids).
      if (!isHandsOnSurface(surface))
        throw new Error(
          `Houston has no '${params.surface}' screen to hand over. Use one of: ${surfaceList}.`,
        );
      if (!personalAssistant && ACCOUNT_OWNER_SURFACES.has(surface))
        throw new Error(
          `Houston's '${surface}' screen is the user's own to open, not yours to hand over. Say what you need and why in your reply and let them decide. Screens you may hand over: ${surfaceList}.`,
        );
      const reason = params.reason?.trim();
      recordHandsOn({ surface, ...(reason ? { reason } : {}) });
      return {
        content: [
          {
            type: "text" as const,
            text: "A card that opens that screen was queued. End your turn after any independent work; Houston messages you once the user says they finished there, or that they skipped it.",
          },
        ],
        details: { surface },
      };
    },
  });
}
