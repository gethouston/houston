/**
 * Write operations on an existing agent, orchestrated by PATCH /api/agents/:id.
 *
 * Each mutation is small and self-contained so the route handler reads as a plain
 * sequence: add a new IR version, set the creator, publish (finalize the slug),
 * unpublish, or flip visibility / request public listing. Version snapshots stay
 * immutable except for the deliberate creator rewrite (so the publicly served IR
 * carries the real author, matching the claim flow). Counters are trigger-owned —
 * nothing here ever writes `installs_count`.
 */

import {
  type AgentIR,
  agentIrSchema,
  migrateAgentIr,
} from "@houston/agentstore-contract";
import { desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";
import { withUniqueViolationRetry } from "./http";
import { projectIdentityColumns } from "./project";

/** The creator shape a PATCH may set (validated by the route via `creatorSchema`). */
export interface AgentCreatorInput {
  displayName: string;
  url?: string;
}

/** Re-fetch an agent row by id (fresh state after a mutation). */
export async function getAgentById(id: string): Promise<schema.Agent | null> {
  const rows = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** The latest (highest-numbered) version row for an agent, or null if none. */
export async function latestVersion(
  tx: typeof db,
  agentId: string,
): Promise<{ id: string; version: number } | null> {
  const rows = await tx
    .select({
      id: schema.agentVersions.id,
      version: schema.agentVersions.version,
    })
    .from(schema.agentVersions)
    .where(eq(schema.agentVersions.agentId, agentId))
    .orderBy(desc(schema.agentVersions.version))
    .limit(1);
  return rows[0] ?? null;
}

/** Outcome of appending a new IR version: success, or a mapped conflict when
 *  concurrent PATCHes exhaust the version-insert retries. */
export type ApplyIrResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

/**
 * Append a new immutable IR snapshot and re-project the denormalized columns. When
 * the agent is already published, the published pointer advances to the new version
 * so the public surface reflects the edit immediately.
 *
 * The version is read-then-inserted as `max+1`, so two concurrent PATCHes on the
 * same agent race for the `(agent_id, version)` unique key. The insert retries on a
 * unique violation (each retry re-reads the now-committed peer's version and moves
 * past it) and, only if the bound is exhausted, reports a 409 `version_conflict`
 * instead of letting a raw 23505 surface as an unhandled 500.
 */
export async function applyNewIr(
  agent: schema.Agent,
  ir: AgentIR,
): Promise<ApplyIrResult> {
  const columns = projectIdentityColumns(ir);
  const outcome = await withUniqueViolationRetry(() =>
    db.transaction(async (tx) => {
      const latest = await latestVersion(tx, agent.id);
      const nextVersion = (latest?.version ?? 0) + 1;
      const [inserted] = await tx
        .insert(schema.agentVersions)
        .values({
          agentId: agent.id,
          version: nextVersion,
          ir,
          irVersion: ir.irVersion,
        })
        .returning({ id: schema.agentVersions.id });

      const patch: Partial<typeof schema.agents.$inferInsert> = { ...columns };
      if (agent.state === "published") patch.publishedVersionId = inserted.id;
      await tx
        .update(schema.agents)
        .set(patch)
        .where(eq(schema.agents.id, agent.id));
    }),
  );
  if (!outcome.ok) return { ok: false, status: 409, error: "version_conflict" };
  return { ok: true };
}

/**
 * Set the agent's creator: update the denormalized columns AND rewrite the latest
 * version's IR identity so the served definition attributes the real author.
 */
export async function applyCreator(
  agent: schema.Agent,
  creator: AgentCreatorInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    const latest = await latestVersion(tx, agent.id);
    if (latest) {
      const rows = await tx
        .select({ ir: schema.agentVersions.ir })
        .from(schema.agentVersions)
        .where(eq(schema.agentVersions.id, latest.id))
        .limit(1);
      if (rows[0]) {
        const current = migrateAgentIr(rows[0].ir);
        const rewritten = agentIrSchema.parse({
          ...current,
          identity: { ...current.identity, creator },
        });
        await tx
          .update(schema.agentVersions)
          .set({ ir: rewritten })
          .where(eq(schema.agentVersions.id, latest.id));
      }
    }
    await tx
      .update(schema.agents)
      .set({
        creatorDisplayName: creator.displayName,
        creatorUrl: creator.url ?? null,
      })
      .where(eq(schema.agents.id, agent.id));
  });
}

/** Archive a published agent (unpublish). Also covers a stray draft archive. */
export async function unpublishAgent(agentId: string): Promise<void> {
  await db
    .update(schema.agents)
    .set({ state: "archived" })
    .where(eq(schema.agents.id, agentId));
}

/** Force visibility back to unlisted (public promotion is not self-serve). */
export async function setVisibilityUnlisted(agentId: string): Promise<void> {
  await db
    .update(schema.agents)
    .set({ visibility: "unlisted" })
    .where(eq(schema.agents.id, agentId));
}

/** Record a request for public listing (reviewed out-of-band, never auto-granted). */
export async function requestPublicListing(agentId: string): Promise<void> {
  await db
    .update(schema.agents)
    .set({ publicRequestedAt: new Date() })
    .where(eq(schema.agents.id, agentId));
}
