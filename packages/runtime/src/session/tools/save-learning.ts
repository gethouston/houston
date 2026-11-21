import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import type { SandboxFetch } from "./sandbox-fetch";
import {
  hostErrorFrom,
  type SessionToolErrorDetails,
  toolErrorResult,
} from "./tool-error";

export const SAVE_LEARNING_TOOL_NAME = "save_learning";

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

interface SavedLearning {
  id: string;
}

export type SaveLearningDetails =
  | { ok: true; id: string }
  | SessionToolErrorDetails;

export function makeSaveLearningTool(opts: SaveLearningToolOptions) {
  return defineTool({
    name: SAVE_LEARNING_TOOL_NAME,
    label: "Remember this",
    description:
      "Save one learning to the user's memory so it survives into future sessions. NEVER write .houston/learnings/learnings.json with file tools to ADD a memory - this tool is the ONLY safe way to save, because it merges with the user's existing memory and records who taught the learning and which mission it came from, so never write the person's name or the mission into the text yourself. The single exception is consolidation: when this tool answers that memory is full, rewrite that file with the merged, trimmed list exactly as it asks, then save again. On success, confirm in plain words - never mention files, JSON, or paths.",
    promptSnippet: "Save a learning to memory",
    parameters: SaveLearningParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SaveLearningParams,
      signal: AbortSignal | undefined,
    ): Promise<AgentToolResult<SaveLearningDetails>> {
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
        return toolErrorResult(await hostErrorFrom(res, "save_learning"));
      }
      const saved = (await res.json()) as SavedLearning;
      return {
        content: [
          {
            type: "text" as const,
            text: "Saved to memory. Tell the user you'll remember it, in plain words.",
          },
        ],
        details: { ok: true, id: saved.id },
      };
    },
  });
}
