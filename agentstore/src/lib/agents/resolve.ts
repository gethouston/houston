/**
 * Public-agent resolver — the single DB read the agent-driven install endpoints
 * (ir / install-instructions / bundle) and the /a/[slug] detail page share.
 *
 * Returns a PUBLISHED, non-deleted agent by its finalized slug. Visibility is NOT
 * filtered: an `unlisted` agent is served by direct link (possession of the URL is
 * the grant); only `state = 'published' AND deleted_at IS NULL` gates access.
 * The published version's IR snapshot is migrated + validated before return, so a
 * malformed snapshot throws rather than serving garbage.
 *
 * NODE RUNTIME ONLY — imports the DB client. Never import from Edge/client.
 */

import { type AgentIR, migrateAgentIr } from "@houston/agentstore-contract";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { siteConfig } from "@/lib/site-config";

/** siteConfig.url with trailing slashes trimmed. `||` so an empty env still
 *  yields a valid absolute base for `new URL(...)`. */
export function siteBase(): string {
  return (siteConfig.url || "https://store.gethouston.ai").replace(/\/+$/, "");
}

/** The public share URL for a published agent slug. */
export function shareUrlForSlug(slug: string): string {
  return `${siteBase()}/a/${encodeURIComponent(slug)}`;
}

export interface AgentInstallUrls {
  /** Public agent page: /a/<slug> */
  pageUrl: string;
  /** Machine-readable AgentIR JSON: /api/agents/<slug>/ir */
  irUrl: string;
  /** Claude Skill .zip bundle: /api/agents/<slug>/bundle?target=claude-skill-zip */
  bundleUrl: string;
  /** Install-instructions text: /api/agents/<slug>/install-instructions */
  instructionsUrl: string;
}

/** Canonical absolute install URLs for a published agent slug. */
export function buildAgentInstallUrls(slug: string): AgentInstallUrls {
  const base = siteBase();
  const s = encodeURIComponent(slug);
  return {
    pageUrl: `${base}/a/${s}`,
    irUrl: `${base}/api/agents/${s}/ir`,
    bundleUrl: `${base}/api/agents/${s}/bundle?target=claude-skill-zip`,
    instructionsUrl: `${base}/api/agents/${s}/install-instructions`,
  };
}

export interface ResolvedPublishedAgent {
  /** The relational agents row (query surface). */
  agent: schema.Agent;
  /** The migrated + validated IR snapshot from the published version. */
  ir: AgentIR;
}

/** Look up a PUBLISHED, non-deleted agent by slug. Returns { agent, ir } or null. */
export async function getPublishedAgentBySlug(
  slug: string,
): Promise<ResolvedPublishedAgent | null> {
  const clean = slug.trim();
  if (!clean) return null;

  const rows = await db
    .select()
    .from(schema.agents)
    .where(
      and(
        eq(schema.agents.slug, clean),
        eq(schema.agents.state, "published"),
        isNull(schema.agents.deletedAt),
      ),
    )
    .limit(1);

  const agent = rows[0];
  if (!agent?.publishedVersionId) return null;

  const versions = await db
    .select({ ir: schema.agentVersions.ir })
    .from(schema.agentVersions)
    .where(eq(schema.agentVersions.id, agent.publishedVersionId))
    .limit(1);

  const versionRow = versions[0];
  if (!versionRow) return null;

  const ir = migrateAgentIr(versionRow.ir);
  return { agent, ir };
}
