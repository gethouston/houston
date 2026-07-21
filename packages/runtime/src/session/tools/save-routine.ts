import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentActingContext } from "../acting-context";
import { currentTurnMode } from "../turn-mode-context";

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

/**
 * The wake binding for an event-triggered scheduled task (Houston Cloud only).
 * All fields optional so both shapes pass the schema; the host validates the
 * binding and rejects it where event triggers are unavailable.
 *  - Composio: `toolkit` + `trigger_slug` + `trigger_config`.
 *  - Webhook:  `kind: "webhook"` (the gateway mints the URL out of band).
 */
const TriggerParam = Type.Object({
  kind: Type.Optional(
    Type.String({
      description: "'webhook' for an incoming-webhook wake; omit for Composio.",
    }),
  ),
  toolkit: Type.Optional(
    Type.String({ description: "Composio toolkit slug, e.g. 'gmail'." }),
  ),
  trigger_slug: Type.Optional(
    Type.String({
      description:
        "Composio trigger-type slug, e.g. 'GMAIL_NEW_GMAIL_MESSAGE'.",
    }),
  ),
  trigger_config: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Config for the Composio trigger type.",
    }),
  ),
  connected_account_id: Type.Optional(
    Type.String({
      description: "Pin only when the user has >1 account for the toolkit.",
    }),
  ),
});

const SaveRoutineParams = Type.Object({
  name: Type.String({
    description: "A short human name for the scheduled task.",
  }),
  prompt: Type.String({
    description:
      "The instruction Houston runs each time the scheduled task wakes.",
  }),
  schedule: Type.Optional(
    Type.String({
      description:
        "A cron expression that wakes the task. Supply this OR 'trigger', never both and never neither.",
    }),
  ),
  trigger: Type.Optional(TriggerParam),
  chat_mode: Type.Optional(
    Type.Union([Type.Literal("shared"), Type.Literal("per_run")], {
      description:
        "'shared' (default): every run continues one chat. 'per_run': each run gets its own chat.",
    }),
  ),
  suppress_when_silent: Type.Optional(
    Type.Boolean({
      description:
        "true to stay silent when a run finds nothing that needs the user's attention.",
    }),
  ),
  enabled: Type.Optional(
    Type.Boolean({ description: "false to save the task turned off." }),
  ),
  integrations: Type.Optional(
    Type.Array(Type.String(), {
      description: "Integration slugs this task uses.",
    }),
  ),
  setup_activity_id: Type.Optional(
    Type.String({
      description:
        "The id of THIS setup chat, so the task links back to the conversation that created it. Stamp it when the kickoff carried one.",
    }),
  ),
  id: Type.Optional(
    Type.String({
      description:
        "Omit to CREATE a new scheduled task. Supply the id of an existing task to UPDATE it in place (only the fields you pass change).",
    }),
  ),
});
type SaveRoutineParams = Static<typeof SaveRoutineParams>;

export interface SaveRoutineToolOptions {
  baseUrl: string;
  /** The per-sandbox HMAC token (HOUSTON_SANDBOX_TOKEN). */
  sandboxToken: string;
}

/** The routine the host echoes back on a successful save. */
interface SavedRoutine {
  id: string;
  name: string;
}

export function makeSaveRoutineTool(opts: SaveRoutineToolOptions) {
  const base = opts.baseUrl.replace(/\/$/, "");

  return defineTool({
    name: SAVE_ROUTINE_TOOL_NAME,
    label: "Save a scheduled task",
    description:
      "Create or update a scheduled task (a Routine) in the user's saved automations. NEVER write .houston/routines/routines.json with file tools — this tool is the ONLY safe way to save, because it merges with the user's other tasks instead of overwriting them. Omit 'id' to create; pass an existing task's 'id' to change it. Give exactly one wake: a 'schedule' (cron) or a 'trigger' (event). On success, tell the user in plain words - never mention files, JSON, or cron.",
    promptSnippet: "Save or update a scheduled task",
    parameters: SaveRoutineParams,
    executionMode: "sequential",
    async execute(
      _id: string,
      params: SaveRoutineParams,
      signal: AbortSignal | undefined,
    ) {
      // WHO this turn acts as (C2): forward the header the host reads so a saved
      // routine records the acting user as its creator — same as the integration
      // tools. Turn-scoped; absent outside a turn.
      const acting = currentActingContext();
      const auto = currentTurnMode() === "auto";
      const res = await fetch(`${base}/sandbox/routines/save`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.sandboxToken}`,
          ...(acting?.actingAs
            ? { "x-houston-acting-as": acting.actingAs }
            : {}),
          ...(acting?.actingUser
            ? { "x-houston-acting-user": acting.actingUser }
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
