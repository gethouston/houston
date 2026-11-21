import { z } from "zod";

export const AGENT_IR_VERSION = "2.0.0" as const;

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;

export const INTEGRATION_REGEX = /^[A-Z0-9_]{1,64}$/;

const slugField = z
  .string()
  .regex(SLUG_REGEX, "must match ^[a-z0-9][a-z0-9-]{0,63}$");

const httpsUrl = (max: number) => z.url({ protocol: /^https$/ }).max(max);

const emojiIcon = z.object({
  kind: z.literal("emoji"),
  value: z.string().min(1).max(80),
});

const urlIcon = z.object({
  kind: z.literal("url"),
  url: httpsUrl(2048),
});

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

export const agentIrSchema = z
  .object({
    irVersion: z.literal(AGENT_IR_VERSION),
    identity: identitySchema,
    instructions: z.string().max(200000),
    skills: z.array(skillSchema).max(64).default([]),
    learnings: z.array(learningSchema).max(500).default([]),
    integrations: z
      .array(
        z.string().regex(INTEGRATION_REGEX, "must match ^[A-Z0-9_]{1,64}$"),
      )
      .max(64)
      .default([]),
    provenance: provenanceSchema,
  })
  .superRefine((ir, ctx) => {
    const skillSlugs = new Set<string>();
    ir.skills.forEach((s, i) => {
      if (skillSlugs.has(s.slug)) {
        ctx.addIssue({
          code: "custom",
          path: ["skills", i, "slug"],
          message: `duplicate skill slug "${s.slug}"`,
        });
      }
      skillSlugs.add(s.slug);
    });

    const learningIds = new Set<string>();
    ir.learnings.forEach((l, i) => {
      if (learningIds.has(l.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["learnings", i, "id"],
          message: `duplicate learning id "${l.id}"`,
        });
      }
      learningIds.add(l.id);
    });
  });

export type AgentIR = z.infer<typeof agentIrSchema>;

type MigrationStep = {
  from: string;
  to: typeof AGENT_IR_VERSION;
  up: (raw: Record<string, unknown>) => Record<string, unknown>;
};

export const IR_MIGRATIONS: MigrationStep[] = [];

export function migrateAgentIr(input: unknown): AgentIR {
  if (input === null || typeof input !== "object") {
    throw new Error("migrateAgentIr: input must be an object");
  }
  let cur = { ...(input as Record<string, unknown>) };

  let guard = 0;
  while (
    cur.irVersion !== AGENT_IR_VERSION &&
    guard < IR_MIGRATIONS.length + 1
  ) {
    const step = IR_MIGRATIONS.find((m) => m.from === cur.irVersion);
    if (!step) break;
    cur = step.up(cur);
    cur.irVersion = step.to;
    guard += 1;
  }

  return agentIrSchema.parse(cur);
}
