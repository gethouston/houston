/**
 * Bridge between Houston's portable content and the Agent Store's AgentIR 2.0.0.
 *
 * `irFromPortable` assembles a publish-ready IR from an agent's gathered portable
 * content (CLAUDE.md + skills + learnings), the wizard's identity/creator choices,
 * and the Composio toolkits the agent expects. `portableFromIr` is its inverse for
 * the mappable surfaces (instructions <-> CLAUDE.md, skills 1:1, learnings 1:1);
 * routines have no place in the IR, so they always come back as an empty array.
 *
 * The IR is run through the contract's own pipeline (`normalizeAgentIr` then
 * `agentIrSchema.parse`), so integrations are uppercased + deduped by the SAME
 * rules the store's ingest uses, and a malformed field surfaces as a thrown
 * validation error rather than a silently-bad publish.
 */
import {
  AGENT_IR_VERSION,
  type AgentIR,
  type AgentProvenance,
  agentIrSchema,
  normalizeAgentIr,
  slugify,
} from "@houston/agentstore-contract";
import type { PortableContent } from "./portable";

/** The identity/creator/integration inputs a publish collects from the wizard. */
export interface IrFromPortableOptions {
  identity: {
    name: string;
    description: string;
    tagline?: string;
    category: string;
    tags?: string[];
  };
  creator: { displayName: string; url?: string };
  /** Composio toolkit slugs the agent expects (any case); normalized in the IR. */
  integrations: string[];
  provenance: AgentProvenance;
}

/**
 * Build a schema-valid AgentIR from portable content + the wizard's choices.
 * `identity.description` is a required input (never defaulted here). Throws if the
 * assembled IR fails validation, so a bad publish never reaches the store silently.
 */
export function irFromPortable(
  content: PortableContent,
  opts: IrFromPortableOptions,
): AgentIR {
  const candidate = {
    irVersion: AGENT_IR_VERSION,
    identity: {
      slug: slugify(opts.identity.name),
      name: opts.identity.name,
      ...(opts.identity.tagline !== undefined
        ? { tagline: opts.identity.tagline }
        : {}),
      description: opts.identity.description,
      category: opts.identity.category,
      tags: opts.identity.tags ?? [],
      creator: opts.creator,
    },
    instructions: content.claudeMd ?? "",
    skills: content.skills.map((s) => ({ slug: s.slug, body: s.body })),
    learnings: content.learnings.map((l) => ({
      id: l.id,
      text: l.text,
      ...(l.created_at ? { createdAt: l.created_at } : {}),
    })),
    integrations: opts.integrations,
    provenance: opts.provenance,
  };
  const { ir } = normalizeAgentIr(candidate);
  return agentIrSchema.parse(ir);
}

/**
 * Inverse of `irFromPortable` for the round-trippable surfaces. `routines` is
 * always `[]` (the IR carries none); an empty `instructions` maps back to an
 * absent CLAUDE.md, since an empty file carries nothing.
 */
export function portableFromIr(ir: AgentIR): {
  content: PortableContent;
  meta: { agentName: string; description: string };
} {
  const content: PortableContent = {
    ...(ir.instructions !== "" ? { claudeMd: ir.instructions } : {}),
    skills: ir.skills.map((s) => ({ slug: s.slug, body: s.body })),
    routines: [],
    learnings: ir.learnings.map((l) => ({
      id: l.id,
      text: l.text,
      created_at: l.createdAt ?? "",
    })),
  };
  return {
    content,
    meta: {
      agentName: ir.identity.name,
      description: ir.identity.description,
    },
  };
}
