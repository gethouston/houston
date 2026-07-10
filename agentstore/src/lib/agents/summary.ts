/**
 * Serialize an `agents` row into the client-facing summary returned by the manage
 * endpoints (GET /api/agents/me, PATCH /api/agents/:id). Reconstructs the icon
 * discriminated union from its two columns and derives the public `shareUrl` for a
 * published agent. Never exposes the manage-token hash or internal counters beyond
 * the public view/install tallies.
 */
import type * as schema from "@/db/schema";
import { shareUrlForSlug } from "./resolve";

export type AgentIconSummary =
  | { kind: "emoji"; value: string }
  | { kind: "url"; url: string }
  | null;

export interface AgentSummary {
  id: string;
  slug: string | null;
  name: string;
  tagline: string | null;
  description: string;
  icon: AgentIconSummary;
  color: string | null;
  category: string;
  tags: string[];
  integrations: string[];
  creator: { displayName: string; url: string | null };
  state: schema.Agent["state"];
  visibility: schema.Agent["visibility"];
  publicRequestedAt: string | null;
  viewsCount: number;
  installsCount: number;
  createdAt: string;
  updatedAt: string;
  shareUrl: string | null;
}

function reconstructIcon(agent: schema.Agent): AgentIconSummary {
  if (!agent.iconKind || !agent.iconValue) return null;
  if (agent.iconKind === "emoji")
    return { kind: "emoji", value: agent.iconValue };
  if (agent.iconKind === "url") return { kind: "url", url: agent.iconValue };
  return null;
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function toAgentSummary(agent: schema.Agent): AgentSummary {
  const published = agent.state === "published" && agent.slug !== null;
  return {
    id: agent.id,
    slug: agent.slug,
    name: agent.name,
    tagline: agent.tagline,
    description: agent.description,
    icon: reconstructIcon(agent),
    color: agent.color,
    category: agent.category,
    tags: agent.tags,
    integrations: agent.integrations,
    creator: { displayName: agent.creatorDisplayName, url: agent.creatorUrl },
    state: agent.state,
    visibility: agent.visibility,
    publicRequestedAt: isoOrNull(agent.publicRequestedAt),
    viewsCount: agent.viewsCount,
    installsCount: agent.installsCount,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
    shareUrl: published && agent.slug ? shareUrlForSlug(agent.slug) : null,
  };
}
