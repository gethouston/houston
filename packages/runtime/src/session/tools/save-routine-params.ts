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
      "The instruction that runs each time the scheduled task wakes.",
  }),
  schedule: Type.Optional(
    Type.String({
      description:
        "When the task wakes: a cron expression, or '@every <N>m' / '@every <N>h' for 'every N minutes/hours' when N doesn't divide 60 (or 24) evenly, e.g. '@every 16m' or '@every 5h'; use cron otherwise. Never combine units (write '@every 90m', not '@every 1h30m'). Supply this OR 'trigger', never both and never neither.",
    }),
  ),
  trigger: Type.Optional(TriggerParam),
  model: Type.Optional(
    Type.String({
      description:
        "Omit model and effort unless the user asked for a specific model or effort. A new routine uses this chat's provider; an existing one keeps its saved provider, so pick a model from that provider. On create, an explicit model overrides the routine default. On update, omit to leave the saved model unchanged.",
    }),
  ),
  effort: Type.Optional(
    Type.String({
      description:
        "Omit model and effort unless the user asked for a specific model or effort. A new routine uses this chat's provider; an existing one keeps its saved provider, so pick a model from that provider. On update, omit to leave the saved effort unchanged.",
    }),
  ),
  chat_mode: Type.Optional(
    Type.Union([Type.Literal("shared"), Type.Literal("per_run")], {
      description:
        "'shared' (default): every run continues one chat. 'per_run': each run gets its own chat. Ask what the user will SEE, in this routine's terms, e.g. 'Where should I put each new email I handle?' Offer 'A new chat for each email' / 'All in one chat', with short descriptions of the effect. Option labels must be distinguishable on their own. Never ask about 'results', 'history', or 'organizing'.",
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
