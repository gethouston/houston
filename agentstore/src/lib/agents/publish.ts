/**
 * The publish transition — finalize a unique slug and flip a draft to published.
 *
 * The slug is derived from the agent name via the contract `slugify`, then each
 * non-reserved candidate is tried against a WHERE state-guard; a unique violation
 * (slug already taken) retries the next `-2`, `-3` … suffix. Idempotent: a already
 * published agent returns its current slug, an archived agent is rejected. Visibility
 * stays unlisted — public promotion is a separate, non-self-serve step.
 */

import { slugify } from "@houston/agentstore-contract";
import { and, eq, type SQL, sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { isUniqueViolation } from "./http";
import { getAgentById, latestVersion } from "./mutations";

/**
 * Yield non-reserved slug candidates: the base first, then `base-2`, `base-3`, …
 * up to `maxAttempts` total attempts. Reserved slugs are skipped, not counted out.
 */
export function* slugCandidates(
  base: string,
  maxAttempts = 25,
): Generator<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (isReservedSlug(candidate)) continue;
    yield candidate;
  }
}

export type PublishResult =
  | { ok: true; slug: string }
  | { ok: false; status: number; error: string };

/** Finalize a slug and publish a draft agent. See module doc for semantics. */
export async function publishAgent(
  agent: schema.Agent,
): Promise<PublishResult> {
  if (agent.state === "published" && agent.slug) {
    return { ok: true, slug: agent.slug };
  }
  if (agent.state === "archived") {
    return { ok: false, status: 409, error: "cannot_publish_archived" };
  }

  const latest = await latestVersion(db, agent.id);
  if (!latest) return { ok: false, status: 409, error: "no_version" };

  const base = slugify(agent.name) || "agent";
  const guard: SQL = and(
    eq(schema.agents.id, agent.id),
    eq(schema.agents.state, "draft"),
    sql`${schema.agents.deletedAt} IS NULL`,
  ) as SQL;

  for (const candidate of slugCandidates(base, 25)) {
    try {
      const rows = await db
        .update(schema.agents)
        .set({
          slug: candidate,
          state: "published",
          publishedVersionId: latest.id,
        })
        .where(guard)
        .returning({ slug: schema.agents.slug });

      if (rows.length > 0) return { ok: true, slug: candidate };

      // No row updated: the draft state changed under us. If a concurrent publish
      // won, report its result idempotently; otherwise it is no longer publishable.
      const fresh = await getAgentById(agent.id);
      if (fresh?.state === "published" && fresh.slug) {
        return { ok: true, slug: fresh.slug };
      }
      return { ok: false, status: 409, error: "not_draft" };
    } catch (err) {
      if (isUniqueViolation(err)) continue;
      throw err;
    }
  }

  return { ok: false, status: 409, error: "slug_exhausted" };
}
