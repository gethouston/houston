/**
 * What a mission waits on the user for: the ordered interaction steps the
 * model records when it ends a turn by asking, and the options they offer.
 */

/** A choice the agent authored, or a structural approval control whose label
 *  the surface owns in its own locale (`kind: "approval"`, id-keyed). */
export type InteractionOption =
  | InteractionChoiceOption
  | { kind: "approval"; id: "approve" | "decline" };

export interface InteractionChoiceOption {
  kind?: "choice";
  id: string;
  label: string;
  /** One muted line of consequence or benefit shown after the label. */
  description?: string;
  /** Mark AT MOST one option as the suggested default. */
  recommended?: boolean;
}

/** The Houston screens a `hands_on` step sends the user to. CLOSED: a client
 *  can only hand over a screen it knows how to open. Mirrors
 *  `packages/protocol/src/domain/interaction-types.ts`. */
export type HandsOnSurface =
  | "apiKeys"
  | "billing"
  | "files"
  | "routineWebhook"
  | "orgDanger"
  | "agentApiAccess";

/** One step in the interaction sequence. `id` is tool-assigned (`q1`..`qN` for
 *  question steps, `s1` for the single signin step, `c1`..`cN` for connect
 *  steps, `h1`..`hN` for hands-on steps) so each step's outcome is
 *  addressable. */
export type InteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      /** Verbatim material the question is ABOUT, when it is too long or too
       *  multi-line to read inside a sentence. Shown under the question in its
       *  own scrollable block, so a value the user approves is always visible. */
      detail?: string;
      options?: InteractionOption[];
      /** Lowercase toolkit slug when the question concerns an integration (e.g.
       *  "gmail"); the app resolves it to the app's identity and BRANDS the
       *  question card's header with the logo + name. Absent = a plain question. */
      toolkit?: string;
      /** The question is answered with a file: the card shows an upload area
       *  above its answer field. Absent = a plain question. */
      wantsFiles?: boolean;
      /** Present ONLY on an approval card for a destructive Houston operation:
       *  the host-issued id of the pending request this card decides. The
       *  user's answer travels back carrying it, which binds the approval to
       *  ONE exact call and makes it usable once. */
      requestId?: string;
    }
  | { kind: "signin"; id: string; reason?: string }
  | {
      kind: "connect";
      id: string;
      toolkit: string;
      reason?: string;
      /** The app IS connected but its login stopped working (an action was
       *  refused as expired, revoked or missing a permission): the card asks
       *  to reconnect and never counts the existing connection as done. */
      reconnect?: boolean;
    }
  /** The user must enter a custom integration's API key in a secure field (never
   *  into the chat). `toolkit` is the custom integration's slug (HOU-550). */
  | { kind: "credential"; id: string; toolkit: string; reason?: string }
  | { kind: "provider_connect"; id: string; provider: string; reason?: string }
  /** An errand only the user's own hands can finish on a Houston screen —
   *  billing, a key revealed once, files from their device. Nothing can observe
   *  the outcome, so the card asks them to say Done or Skip. */
  | {
      kind: "hands_on";
      id: string;
      surface: HandsOnSurface;
      /** The AI Employee the screen belongs to (`agentApiAccess`), by the id
       *  `listAgents` returns. Absent on the screens that are no one's. */
      agentId?: string;
      reason?: string;
    }
  /** The model finished planning: a short plan summary the user approves by
   *  choosing a mode (start working / Autopilot) or dismisses to keep planning. */
  | { kind: "plan_ready"; id: string; summary: string }
  /** The model finished cleanly and offers to save the just-completed work as a
   *  reusable Skill, a scheduled Routine, or a Learning to remember. Optional and
   *  dismissible; a non-blocking offer the settled card renders. Steps never pick
   *  the board status — a clean finish always settles `needs_you`. Mirrors
   *  `packages/protocol/src/domain/interaction.ts`. */
  | {
      kind: "suggest_reusable";
      id: string;
      reusableKind: "skill" | "routine" | "learning";
      title: string;
      rationale: string;
    }
  /** Optional, concrete follow-up actions after a clean finish. A non-blocking
   * offer the settled card renders; it never affects which status the turn settles. */
  | {
      kind: "suggest_actions";
      id: string;
      actions: { id: string; label: string; message: string }[];
    };

/**
 * The ordered steps a mission is waiting on the user for — recorded when the
 * model ends a turn by asking (ask_user) and/or requesting a connection
 * (request_connection). Present drives the `needs_you` board card and the
 * composer-replacing card, which walks the user through the steps one at a time;
 * absent means the mission needs nothing. Question steps come first (at most 3),
 * then at most one signin step, then connect steps.
 */
export interface PendingInteraction {
  steps: InteractionStep[];
}
