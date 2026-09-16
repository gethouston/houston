/**
 * AgentIR 2.0.0 — the Houston Agent Store schema-of-record.
 *
 * A single, framework-agnostic representation of a shareable agent: identity,
 * the agent's CLAUDE.md (`instructions`), its skills as VERBATIM SKILL.md bodies,
 * captured learnings, the Composio toolkits it expects, its routines, and
 * provenance. This is the canonical shape validated before any version snapshot
 * is stored and served back over the API; the forgiving backfill lives in
 * `normalize.ts`, never here.
 *
 * The exported `AgentIR` type is `z.infer<typeof agentIrSchema>` so the schema is
 * the sole source of truth — there is no hand-written interface to drift from.
 */
import { z } from "zod";

/**
 * The pinned IR version literal. MINOR = additive optional fields (no
 * migration); MAJOR = breaking (prepend a step to IR_MIGRATIONS).
 *
 * An ADDITIVE OPTIONAL FIELD DOES NOT BUMP THIS LITERAL. Readers pin the
 * version as a const (zod `z.literal`, and the Go gateway's equality check), so
 * a bump makes every already-shipped reader REJECT new listings outright, while
 * an extra key is dropped harmlessly by both zod (`z.object` strips unknown
 * keys) and Go (`encoding/json` ignores them). `routines` arrived this way.
 */
export const AGENT_IR_VERSION = "2.0.0" as const;

/** Slug: starts with an alphanumeric, then up to 63 more of `[a-z0-9-]`. Used for
 *  identity.slug, identity.category, identity.tags, and skill.slug. */
export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Composio toolkit slug: uppercase alphanumerics + underscore, 1..64. */
export const INTEGRATION_REGEX = /^[A-Z0-9_]{1,64}$/;

const slugField = z
  .string()
  .regex(SLUG_REGEX, "must match ^[a-z0-9][a-z0-9-]{0,63}$");

/** An https URL, bounded to `max` characters. */
const httpsUrl = (max: number) => z.url({ protocol: /^https$/ }).max(max);

const emojiIcon = z.object({
  kind: z.literal("emoji"),
  value: z.string().min(1).max(80),
});

const urlIcon = z.object({
  kind: z.literal("url"),
  url: httpsUrl(2048),
});

/** identity.icon is either an emoji or an https image URL. */
export const iconSchema = z.discriminatedUnion("kind", [emojiIcon, urlIcon]);

export const creatorSchema = z.object({
  displayName: z.string().min(1).max(80),
  url: httpsUrl(2048).optional(),
});

export const identitySchema = z.object({
  slug: slugField,
  name: z.string().min(1).max(120),
  tagline: z.string().max(160).optional(),
  description: z.string().min(1).max(20000),
  icon: iconSchema.optional(),
  color: z.string().max(32).optional(),
  category: slugField,
  tags: z.array(slugField).max(6).default([]),
  creator: creatorSchema,
});
export type AgentIdentity = z.infer<typeof identitySchema>;

export const skillSchema = z.object({
  slug: slugField,
  /** The FULL SKILL.md text (YAML frontmatter + markdown body), verbatim. */
  body: z.string().min(1).max(200000),
});
export type AgentSkill = z.infer<typeof skillSchema>;

export const learningSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(4000),
  createdAt: z.iso.datetime().optional(),
});
export type AgentLearning = z.infer<typeof learningSchema>;

export const provenanceSchema = z.object({
  createdVia: z.enum(["houston", "agent-post"]),
  exporter: z.string().max(80).optional(),
  houstonVersion: z.string().max(40).optional(),
  anonymized: z.boolean().optional(),
});
export type AgentProvenance = z.infer<typeof provenanceSchema>;

/** Composio toolkit slug AS A ROUTINE BINDING STORES IT: lowercase (`gmail`).
 *  The IR's `integrations` chips use the uppercase form, hence two regexes. */
export const ROUTINE_TOOLKIT_REGEX = /^[a-z0-9_]{1,64}$/;

/** Composio trigger-type slug, e.g. `GMAIL_NEW_GMAIL_MESSAGE`. */
export const ROUTINE_TRIGGER_SLUG_REGEX = /^[A-Z0-9_]{1,128}$/;

/** Cap on the canonical `JSON.stringify` of a wake's `triggerConfig`. */
export const MAX_TRIGGER_CONFIG_CHARS = 8000;

/** Max routines in one listing. */
export const MAX_ROUTINES = 32;

// A cron is a bounded string here, not a parsed pattern: the store is not a
// cron engine, and a pattern Houston rejects surfaces at install.
const scheduleWake = z.object({
  kind: z.literal("schedule"),
  cron: z.string().min(1).max(120),
});

const composioWake = z.object({
  kind: z.literal("composio"),
  toolkit: z
    .string()
    .regex(ROUTINE_TOOLKIT_REGEX, "must match ^[a-z0-9_]{1,64}$"),
  triggerSlug: z
    .string()
    .regex(ROUTINE_TRIGGER_SLUG_REGEX, "must match ^[A-Z0-9_]{1,128}$"),
  /** User intent (which label, which channel) — never a credential. */
  triggerConfig: z
    .record(z.string(), z.unknown())
    .refine(
      (v) => JSON.stringify(v).length <= MAX_TRIGGER_CONFIG_CHARS,
      `triggerConfig must serialize to at most ${MAX_TRIGGER_CONFIG_CHARS} chars`,
    ),
});

const webhookWake = z.object({ kind: z.literal("webhook") });

export const routineWakeSchema = z.discriminatedUnion("kind", [
  scheduleWake,
  composioWake,
  webhookWake,
]);
export type AgentRoutineWake = z.infer<typeof routineWakeSchema>;

export const routineSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  prompt: z.string().min(1).max(20000),
  wake: routineWakeSchema,
  chatMode: z.enum(["shared", "per_run"]).optional(),
  suppressWhenSilent: z.boolean().optional(),
});
export type AgentRoutine = z.infer<typeof routineSchema>;

export const agentIrSchema = z
  .object({
    irVersion: z.literal(AGENT_IR_VERSION),
    identity: identitySchema,
    /** The agent's CLAUDE.md. May be empty. */
    instructions: z.string().max(200000),
    skills: z.array(skillSchema).max(64).default([]),
    learnings: z.array(learningSchema).max(500).default([]),
    integrations: z
      .array(
        z.string().regex(INTEGRATION_REGEX, "must match ^[A-Z0-9_]{1,64}$"),
      )
      .max(64)
      .default([]),
    routines: z.array(routineSchema).max(MAX_ROUTINES).default([]),
    provenance: provenanceSchema,
  })
  .superRefine((ir, ctx) => {
    // One rule for every id-like field: a duplicate is a publisher mistake that
    // would silently merge two skills / learnings / routines downstream.
    const unique: Array<[string, string, string[]]> = [
      ["skills", "slug", ir.skills.map((s) => s.slug)],
      ["learnings", "id", ir.learnings.map((l) => l.id)],
      ["routines", "id", ir.routines.map((r) => r.id)],
    ];
    for (const [field, key, values] of unique) {
      const seen = new Set<string>();
      values.forEach((value, i) => {
        if (seen.has(value)) {
          ctx.addIssue({
            code: "custom",
            path: [field, i, key],
            message: `duplicate ${field.slice(0, -1)} ${key} "${value}"`,
          });
        }
        seen.add(value);
      });
    }
  });

export type AgentIR = z.infer<typeof agentIrSchema>;
