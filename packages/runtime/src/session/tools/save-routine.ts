import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  canonicalProviderId,
  modelDisplayName,
  recordConversationKind,
} from "@houston/domain";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import { currentTurnMode } from "../turn-mode-context";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";
import {
  SaveRoutineParams,
  type SaveRoutineParamsValue,
} from "./save-routine-params";

export const SAVE_ROUTINE_TOOL_NAME = "save_routine";

export interface SaveRoutineToolOptions {
  call: SandboxFetch;
}

export const ROUTINE_RUN_SAVE_REFUSAL =
  "save_routine is not available inside a running routine. This turn IS the automation firing - do the work it describes and reply with the result. The user can change the routine from its own screen or its setup chat.";

function inRoutineRun(): boolean {
  const id = currentConversationId();
  return id !== undefined && recordConversationKind(id) === "routine";
}

interface SavedRoutine {
  id: string;
  name: string;
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
}

export function makeSaveRoutineTool(opts: SaveRoutineToolOptions) {
  return defineTool({
    name: SAVE_ROUTINE_TOOL_NAME,
    label: "Save a scheduled task",
    description:
      "Create or update a Routine (a scheduled task) in the user's saved automations: the ONLY safe way to save one, because it merges with the user's other routines instead of overwriting them. Omit 'id' to create; pass an existing task's 'id' to change it. Give exactly one wake: a 'schedule' (cron, or '@every <N>m' / '@every <N>h' for an uneven interval) or a 'trigger' (event). A save can be refused because it runs more often than this person's plan allows; offer the closest allowed cadence and ask before saving again. On success, tell the user in plain words - never mention files, JSON, cron, or '@every'.",
    promptSnippet: "Save or update a scheduled task",
    parameters: SaveRoutineParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SaveRoutineParamsValue,
      signal: AbortSignal | undefined,
    ) {
      if (inRoutineRun()) throw new Error(ROUTINE_RUN_SAVE_REFUSAL);
      const acting = currentActingContext();
      const conversationId = currentConversationId();
      const auto = currentTurnMode() === "auto";
      const res = await opts.call("/sandbox/routines/save", {
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
          ...(auto ? { "x-houston-turn-mode": "auto" } : {}),
        },
        body: JSON.stringify(params),
        signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          `save_routine failed (${res.status}): ${detail.slice(0, 300)}`,
        );
      }
      const saved = (await res.json()) as SavedRoutine;
      const modelName =
        saved.provider && saved.model
          ? modelDisplayName(
              canonicalProviderId(saved.provider) ?? saved.provider,
              saved.model,
            )
          : undefined;
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved the scheduled task '${saved.name}'. It will run on ${modelName ?? saved.model ?? "the agent's current model"}. Tell the user it is set up in plain words. Name the model only if the user asks or it matters, using plain everyday words such as "a faster, lower-cost model", never the raw model id.`,
          },
        ],
        details: {
          id: saved.id,
          provider: saved.provider ?? null,
          model: saved.model ?? null,
          effort: saved.effort ?? null,
        },
      };
    },
  });
}
