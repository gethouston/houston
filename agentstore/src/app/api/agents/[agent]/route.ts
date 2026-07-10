/**
 * PATCH /api/agents/:id  — mutate an agent (manage-token authenticated).
 * DELETE /api/agents/:id — soft-delete an agent.
 *
 * PATCH accepts any combination of: { ir } (new version), { creator }, { publish:
 * true } (finalize slug + go published), { visibility: "unlisted" }, { requestPublic:
 * true } (records interest only — public listing is not self-serve), { unpublish:
 * true } (archive). Operations apply in a deterministic order and the fresh summary
 * (with shareUrl when published) is returned. The path id MUST match the token's
 * agent; a mismatch is an indistinguishable 404 so the endpoint is no ownership
 * oracle. Counters remain trigger-owned — never written here.
 */

import { creatorSchema } from "@houston/agentstore-contract";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { json, readJsonObject } from "@/lib/agents/http";
import { ingestIr } from "@/lib/agents/ingest";
import { authenticateManage } from "@/lib/agents/manage-auth";
import {
  type AgentCreatorInput,
  applyCreator,
  applyNewIr,
  getAgentById,
  requestPublicListing,
  setVisibilityUnlisted,
  unpublishAgent,
} from "@/lib/agents/mutations";
import { publishAgent } from "@/lib/agents/publish";
import { shareUrlForSlug } from "@/lib/agents/resolve";
import { toAgentSummary } from "@/lib/agents/summary";
import { db } from "@/lib/db";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ agent: string }> };

export async function PATCH(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`agents:patch:${ip}`, 30, 60_000)) {
    return json({ error: "rate_limited" }, 429);
  }

  const { agent: agentId } = await params;
  const agent = await authenticateManage(request);
  if (!agent) return json({ error: "unauthorized" }, 401);
  if (agent.id !== agentId || agent.deletedAt)
    return json({ error: "not_found" }, 404);

  const parsed = await readJsonObject(request);
  if (!parsed.ok) return json(parsed.body, parsed.status);
  const body = parsed.value;

  if (body.publish === true && body.unpublish === true) {
    return json({ error: "conflicting_ops" }, 400);
  }
  if ("visibility" in body && body.visibility !== "unlisted") {
    return json({ error: "invalid_visibility" }, 400);
  }

  let creator: AgentCreatorInput | undefined;
  if ("creator" in body) {
    const result = creatorSchema.safeParse(body.creator);
    if (!result.success) {
      return json(
        { error: "invalid_creator", details: result.error.flatten() },
        400,
      );
    }
    creator = result.data;
  }

  let current = agent;

  if ("ir" in body) {
    const ingested = ingestIr(body.ir);
    if (!ingested.ok) return json(ingested.body, ingested.status);
    const applied = await applyNewIr(current, ingested.ir);
    if (!applied.ok) return json({ error: applied.error }, applied.status);
    current = (await getAgentById(current.id)) ?? current;
  }

  if (creator) {
    await applyCreator(current, creator);
  }

  if (body.unpublish === true) {
    await unpublishAgent(current.id);
  }

  if (body.publish === true) {
    const result = await publishAgent(current);
    if (!result.ok) return json({ error: result.error }, result.status);
  }

  if (body.visibility === "unlisted") {
    await setVisibilityUnlisted(current.id);
  }

  if (body.requestPublic === true) {
    await requestPublicListing(current.id);
  }

  const fresh = (await getAgentById(current.id)) ?? current;
  const shareUrl =
    fresh.state === "published" && fresh.slug
      ? shareUrlForSlug(fresh.slug)
      : undefined;
  return json({
    agent: toAgentSummary(fresh),
    ...(shareUrl ? { shareUrl } : {}),
  });
}

export async function DELETE(
  request: Request,
  { params }: Params,
): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`agents:delete:${ip}`, 30, 60_000)) {
    return json({ error: "rate_limited" }, 429);
  }

  const { agent: agentId } = await params;
  const agent = await authenticateManage(request);
  if (!agent) return json({ error: "unauthorized" }, 401);
  if (agent.id !== agentId) return json({ error: "not_found" }, 404);
  if (agent.deletedAt) return json({ deleted: true });

  await db
    .update(schema.agents)
    .set({ deletedAt: new Date() })
    .where(eq(schema.agents.id, agent.id));
  return json({ deleted: true });
}
