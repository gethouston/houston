import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import type { SandboxFetch } from "./sandbox-fetch";

/**
 * The agent's structured tool to SAVE a learning (a stable fact or preference
 * the agent should carry into future sessions).
 *
 * WHY it exists: the product prompt used to tell the agent to edit
 * `.houston/learnings/learnings.json` with file tools. Two problems with that.
 * (1) It is the same wholesale-write hazard `save_routine` was created for — a
 * model that rewrites the array drops everything it did not happen to read.
 * (2) A learning has PROVENANCE the agent cannot know or be trusted to write:
 * WHO taught it and WHICH mission it came from. Both are derived server-side —
 * the person from the gateway-minted acting-as header, the mission from the
 * turn's conversation id — so the tool takes only the learning's text.
 *
 * Same trust posture as the other host-proxying tools: it holds no secret and
 * carries only the per-sandbox HMAC token; the host resolves the sandbox to its
 * workspace, stamps provenance, and owns the merge-safe write.
 */
export const SAVE_LEARNING_TOOL_NAME = "save_learning";

/** The header carrying the turn's conversation id, so the host can resolve the
 *  mission this learning came from. Read-only provenance, never authorization. */
export const CONVERSATION_ID_HEADER = "x-houston-conversation-id";

const SaveLearningParams = Type.Object({
  text: Type.String({
    description:
      "The learning itself, in one or two plain sentences, written so it still makes sense months later without this conversation's context.",
  }),
});
type SaveLearningParams = Static<typeof SaveLearningParams>;

export interface SaveLearningToolOptions {
  call: SandboxFetch;
}

/** What the host echoes back on a successful save. */
interface SavedLearning {
  id: string;
}

export function makeSaveLearningTool(opts: SaveLearningToolOptions) {
  return defineTool({
    name: SAVE_LEARNING_TOOL_NAME,
    label: "Remember this",
    description:
      "Save one learning to the user's memory so it survives into future sessions. NEVER write .houston/learnings/learnings.json with file tools — this tool is the ONLY safe way to save, because it merges with the user's existing memory instead of overwriting it, and it records who taught the learning and which mission it came from. Pass only the learning's text. On success, confirm in plain words - never mention files, JSON, or paths.",
    promptSnippet: "Save a learning to memory",
    parameters: SaveLearningParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SaveLearningParams,
      signal: AbortSignal | undefined,
    ) {
      // WHO this turn acts as (C2) and WHICH conversation it belongs to: both
      // are turn-scoped ambient context, forwarded so the host can stamp the
      // learning's provenance. Absent outside a turn (or off the gateway), and
      // the host then simply stamps nothing.
      const acting = currentActingContext();
      const conversationId = currentConversationId();
      const res = await opts.call("/sandbox/learnings/save", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(acting?.actingAs
            ? { "x-houston-acting-as": acting.actingAs }
            : {}),
          ...(acting?.actingUser
            ? { "x-houston-acting-user": acting.actingUser }
            : {}),
          ...(conversationId
            ? { [CONVERSATION_ID_HEADER]: conversationId }
            : {}),
        },
        body: JSON.stringify({ text: params.text }),
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // The host's error bodies are already agent-actionable (empty text,
        // memory not available on this install) — relay them so the agent
        // explains the reason to the user and can correct itself.
        throw new Error(
          `save_learning failed (${res.status}): ${detail.slice(0, 300)}`,
        );
      }
      const saved = (await res.json()) as SavedLearning;
      return {
        content: [
          {
            type: "text" as const,
            text: "Saved to memory. Tell the user you'll remember it, in plain words.",
          },
        ],
        details: { id: saved.id },
      };
    },
  });
}
