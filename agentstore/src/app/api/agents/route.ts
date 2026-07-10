/**
 * POST /api/agents — tokenless AgentIR ingestion (AGENT-NATIVE publish).
 *
 * Anyone (typically an AI agent) POSTs a full AgentIR body — bare or `{ ir }`.
 * We: rate-limit by IP, size-cap + parse, normalize + validate + secret-scan
 * (422 on any problem), then create a DRAFT agent (unlisted, slug NULL) plus its
 * immutable v1 IR snapshot in one transaction. The manage token is returned ONCE;
 * only its SHA-256 hash is stored. Nothing is public until an explicit publish.
 */
import type { AgentIR } from "@houston/agentstore-contract";
import { hashManageToken, newManageToken } from "@houston/agentstore-contract";
import * as schema from "@/db/schema";
import { isUniqueViolation, json, readJsonObject } from "@/lib/agents/http";
import { ingestIr, unwrapIrInput } from "@/lib/agents/ingest";
import { projectIdentityColumns } from "@/lib/agents/project";
import { siteBase } from "@/lib/agents/resolve";
import { db } from "@/lib/db";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Insert a draft agent + its v1 snapshot. Regenerates the token once on the
 *  astronomically-rare manage-token-hash collision. */
async function createAgent(
  ir: AgentIR,
): Promise<{ agentId: string; token: string }> {
  const columns = projectIdentityColumns(ir);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const token = newManageToken();
    const manageTokenHash = await hashManageToken(token);
    try {
      const agentId = await db.transaction(async (tx) => {
        const [agent] = await tx
          .insert(schema.agents)
          .values({
            ...columns,
            manageTokenHash,
            state: "draft",
            visibility: "unlisted",
          })
          .returning({ id: schema.agents.id });
        await tx.insert(schema.agentVersions).values({
          agentId: agent.id,
          version: 1,
          ir,
          irVersion: ir.irVersion,
        });
        return agent.id;
      });
      return { agentId, token };
    } catch (err) {
      if (isUniqueViolation(err) && attempt === 0) continue;
      throw err;
    }
  }
  // Unreachable: the loop returns or throws on both attempts.
  throw new Error("createAgent: exhausted manage-token attempts");
}

export async function POST(request: Request): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`agents:post:${ip}`, 10, 60_000)) {
    return json({ error: "rate_limited" }, 429);
  }

  const parsed = await readJsonObject(request);
  if (!parsed.ok) return json(parsed.body, parsed.status);

  const ingested = ingestIr(unwrapIrInput(parsed.value));
  if (!ingested.ok) return json(ingested.body, ingested.status);

  const { agentId, token } = await createAgent(ingested.ir);

  const base = siteBase();
  return json(
    {
      agentId,
      manageToken: token,
      claimUrl: `${base}/claim#t=${token}`,
      schemaUrl: `${base}/api/schema/agent`,
    },
    201,
  );
}
