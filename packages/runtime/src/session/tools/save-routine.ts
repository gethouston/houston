import { defineTool } from "@earendil-works/pi-coding-agent";
import { currentActingContext } from "../acting-context";
import { currentConversationId } from "../conversation-context";
import { currentTurnMode } from "../turn-mode-context";
import type { SandboxFetch } from "./sandbox-fetch";
import { CONVERSATION_ID_HEADER } from "./save-learning";
import {
  SaveRoutineParams,
  type SaveRoutineParamsValue,
} from "./save-routine-params";

/**
 * The agent's structured tool to CREATE or UPDATE a scheduled task (a Routine).
 *
 * WHY it exists: the product prompt used to tell the agent to write
 * `.houston/routines/routines.json` wholesale with file tools. Each setup chat is
 * isolated and only knows its own routine, so creating task #2 overwrote the file
 * with a one-element array — deleting task #1. This tool posts to the host's
 * merge-safe sandbox route (`/sandbox/routines/save`), which reads the existing
 * file, adds or updates one entry, and writes the whole survivor set back. The
 * agent NEVER touches routines.json directly.
 *
 * Same trust posture as the integration setup tools: it holds no secret and
 * carries only the per-sandbox HMAC token; the host resolves the sandbox to its
 * workspace and owns the write. Validation failures (both/neither wake, a bad
 * cron, a trigger on a deployment that cannot fire one) come back as tool errors
 * the agent relays to the user in plain words.
 */
export const SAVE_ROUTINE_TOOL_NAME = "save_routine";

export interface SaveRoutineToolOptions {
  call: SandboxFetch;
}

/**
 * Refusal for a save attempted from INSIDE a firing routine's own run.
 *
 * A routine's prompt often reads like a scheduling request ("Every hour, post
 * two quotes…"); fired verbatim it used to push the agent into creating a COPY
 * of the routine that was running, and the run's real work never happened
 * (PRODUCT-1208). The run prompt now says so explicitly, and this is the hard
 * backstop: a run conversation (`routine-<id>`, from routineConversationId)
 * may never write routines. Setup chats are `activity-<id>`, so authoring is
 * untouched.
 */
export const ROUTINE_RUN_SAVE_REFUSAL =
  "save_routine is not available inside a running routine. This turn IS the automation firing - do the work it describes and reply with the result. The user can change the routine from its own screen or its setup chat.";

/** True while the turn is a routine RUN (never its setup chat). */
function inRoutineRun(): boolean {
  return currentConversationId()?.startsWith("routine-") ?? false;
}

/** The routine the host echoes back on a successful save. */
interface SavedRoutine {
  id: string;
  name: string;
}

export function makeSaveRoutineTool(opts: SaveRoutineToolOptions) {
  return defineTool({
    name: SAVE_ROUTINE_TOOL_NAME,
    label: "Save a scheduled task",
    description:
      "Create or update a scheduled task (a Routine) in the user's saved automations. NEVER write .houston/routines/routines.json with file tools - this tool is the ONLY safe way to save, because it merges with the user's other tasks instead of overwriting them. Omit 'id' to create; pass an existing task's 'id' to change it. Give exactly one wake: a 'schedule' (cron) or a 'trigger' (event). On success, tell the user in plain words - never mention files, JSON, or cron.",
    promptSnippet: "Save or update a scheduled task",
    parameters: SaveRoutineParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SaveRoutineParamsValue,
      signal: AbortSignal | undefined,
    ) {
      // A firing routine may not author routines — see ROUTINE_RUN_SAVE_REFUSAL.
      if (inRoutineRun()) throw new Error(ROUTINE_RUN_SAVE_REFUSAL);
      // WHO this turn acts as (C2) and WHICH conversation it belongs to: both
      // are turn-scoped ambient context, forwarded exactly as start_mission and
      // houston_call forward them. The conversation id is what lets the host key
      // the save to the live turn it recorded, so `created_by` comes from an
      // identity the HOST holds rather than one this runtime asserts. Absent
      // outside a turn, and the host then stamps nothing.
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
        // The host's error bodies are already agent-actionable (both/neither
        // wake, invalid cron, event triggers unavailable) — relay them so the
        // agent explains the reason to the user and can correct itself.
        throw new Error(
          `save_routine failed (${res.status}): ${detail.slice(0, 300)}`,
        );
      }
      const saved = (await res.json()) as SavedRoutine;
      return {
        content: [
          {
            type: "text" as const,
            text: `Saved the scheduled task '${saved.name}'. Tell the user it is set up, in plain words.`,
          },
        ],
        details: { id: saved.id },
      };
    },
  });
}
