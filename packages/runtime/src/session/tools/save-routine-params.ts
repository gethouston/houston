import { type Static, Type } from "typebox";

/**
 * What `save_routine` takes, as the model fills it in. Split from the tool so
 * the schema - which is documentation the model READS, not logic - can grow a
 * field without pushing the tool's own behaviour off the page.
 */

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

export const SaveRoutineParams = Type.Object({
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
export type SaveRoutineParamsValue = Static<typeof SaveRoutineParams>;
