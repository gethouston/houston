/**
 * The `routines` fragment of the public AgentIR JSON Schema, kept beside the
 * main document (`json-schema.ts`) only so neither file outgrows the size cap.
 * Same rules apply: HAND-MAINTAINED, and it must move in lockstep with
 * `ir-routine.ts` (the zod schema-of-record).
 *
 * `wake` is a `oneOf` of three closed objects discriminated by a `const` kind,
 * mirroring zod's `discriminatedUnion("kind", …)`: a generator reading this
 * schema then emits one of the three shapes rather than a soup of optional keys.
 */
import {
  MAX_ROUTINES,
  MAX_TRIGGER_CONFIG_CHARS,
  ROUTINE_TOOLKIT_REGEX,
  ROUTINE_TRIGGER_SLUG_REGEX,
} from "./ir";

const TOOLKIT_PATTERN = ROUTINE_TOOLKIT_REGEX.source;
const TRIGGER_SLUG_PATTERN = ROUTINE_TRIGGER_SLUG_REGEX.source;

const scheduleWake = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "cron"],
  properties: {
    kind: { const: "schedule" },
    cron: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description: 'A cron expression, e.g. "0 8 * * 1-5".',
    },
  },
} as const;

const composioWake = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "toolkit", "triggerSlug", "triggerConfig"],
  properties: {
    kind: { const: "composio" },
    toolkit: {
      type: "string",
      pattern: TOOLKIT_PATTERN,
      description: 'Lowercase Composio toolkit slug, e.g. "gmail".',
    },
    triggerSlug: {
      type: "string",
      pattern: TRIGGER_SLUG_PATTERN,
      description: 'Composio trigger type, e.g. "GMAIL_NEW_GMAIL_MESSAGE".',
    },
    triggerConfig: {
      type: "object",
      description:
        "What the user chose to watch (a label, a channel). Never a credential; " +
        `at most ${MAX_TRIGGER_CONFIG_CHARS} characters once serialized.`,
    },
  },
} as const;

const webhookWake = {
  type: "object",
  additionalProperties: false,
  required: ["kind"],
  properties: { kind: { const: "webhook" } },
} as const;

export const agentRoutinesJsonSchema = {
  type: "array",
  maxItems: MAX_ROUTINES,
  description:
    "The agent's automations: what wakes it and what it then does. Ids must be " +
    "unique. Omit or send [].",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["id", "name", "prompt", "wake"],
    properties: {
      id: { type: "string", minLength: 1, maxLength: 64 },
      name: { type: "string", minLength: 1, maxLength: 120 },
      prompt: {
        type: "string",
        minLength: 1,
        maxLength: 20000,
        description: "What the agent does each time the routine wakes.",
      },
      wake: {
        description:
          "What wakes the routine: a clock, an app event, or a call.",
        oneOf: [scheduleWake, composioWake, webhookWake],
      },
      chatMode: {
        enum: ["shared", "per_run"],
        description:
          '"shared" (default): every run continues one chat. "per_run": each run gets its own.',
      },
      suppressWhenSilent: {
        type: "boolean",
        description:
          "true to stay quiet when a run finds nothing worth saying.",
      },
    },
  },
} as const;
