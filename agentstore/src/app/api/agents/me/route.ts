/**
 * GET /api/agents/me — the caller's own agent, resolved from its Bearer manage
 * token. Returns the agent summary (drafts included) plus the latest version's IR
 * so the claim/manage UI can preview and edit it. Generic 401 on any auth failure.
 */

import { migrateAgentIr } from "@houston/agentstore-contract";
import { desc, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { json } from "@/lib/agents/http";
import { authenticateManage } from "@/lib/agents/manage-auth";
import { toAgentSummary } from "@/lib/agents/summary";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const agent = await authenticateManage(request);
  if (!agent || agent.deletedAt) return json({ error: "unauthorized" }, 401);

  const versions = await db
    .select({ ir: schema.agentVersions.ir })
    .from(schema.agentVersions)
    .where(eq(schema.agentVersions.agentId, agent.id))
    .orderBy(desc(schema.agentVersions.version))
    .limit(1);

  let ir = null;
  const latest = versions[0];
  if (latest) {
    try {
      ir = migrateAgentIr(latest.ir);
    } catch {
      return json({ error: "corrupt_ir" }, 500);
    }
  }

  return json({ agent: toAgentSummary(agent), ir });
}
