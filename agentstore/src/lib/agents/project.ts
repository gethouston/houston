/**
 * Project an AgentIR's identity onto the denormalized `agents` row columns.
 *
 * The catalog row carries a flat copy of the identity fields (name/tagline/icon/
 * category/tags/…) so listing and search never have to open the JSONB IR. The IR
 * itself remains the schema-of-record in `agent_versions`; this projection is the
 * single place that maps IR -> columns for both first insert and every re-version.
 */
import type { AgentIR } from "@houston/agentstore-contract";

/** The identity-derived columns written to (and re-written on) an `agents` row. */
export interface AgentIdentityColumns {
  name: string;
  tagline: string | null;
  description: string;
  iconKind: string | null;
  iconValue: string | null;
  color: string | null;
  category: string;
  tags: string[];
  integrations: string[];
  creatorDisplayName: string;
  creatorUrl: string | null;
}

/** Flatten `ir.identity` (+ `ir.integrations`) into the `agents` column set. */
export function projectIdentityColumns(ir: AgentIR): AgentIdentityColumns {
  const { identity } = ir;
  const { icon } = identity;
  return {
    name: identity.name,
    tagline: identity.tagline ?? null,
    description: identity.description,
    iconKind: icon ? icon.kind : null,
    iconValue: icon ? (icon.kind === "emoji" ? icon.value : icon.url) : null,
    color: identity.color ?? null,
    category: identity.category,
    tags: identity.tags,
    integrations: ir.integrations,
    creatorDisplayName: identity.creator.displayName,
    creatorUrl: identity.creator.url ?? null,
  };
}
