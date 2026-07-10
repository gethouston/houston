/**
 * Manage-token authentication for the Agent Store.
 *
 * A manage token is the per-agent bearer secret handed back once at
 * POST /api/agents. It is the ONLY credential proving "this upload is mine". We
 * never store it in the clear — only its SHA-256 hash (`manage_token_hash`,
 * unique + indexed). Auth is: parse the Bearer header, hash it, do the indexed
 * lookup by hash, then constant-time compare the stored hash to close any
 * theoretical timing gap. Every failure returns `null` — the caller responds with
 * a single generic 401, so the endpoint is not an existence/validity oracle.
 */

import {
  hashManageToken,
  timingSafeEqualHex,
} from "@houston/agentstore-contract";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { db } from "@/lib/db";

/** Extract the raw token from an `Authorization: Bearer <token>` header. */
export function extractBearerToken(headers: Headers): string | null {
  const raw = headers.get("authorization");
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/** Resolve the agent a manage token authorizes, or null if none matches. */
export async function resolveAgentByManageToken(
  token: string,
): Promise<schema.Agent | null> {
  const hash = await hashManageToken(token);
  const rows = await db
    .select()
    .from(schema.agents)
    .where(eq(schema.agents.manageTokenHash, hash))
    .limit(1);
  const agent = rows[0];
  if (!agent) return null;
  // The lookup already matched by hash equality; this closes the timing gap.
  if (!timingSafeEqualHex(agent.manageTokenHash, hash)) return null;
  return agent;
}

/** Authenticate a request by its Bearer manage token. Null on any failure. */
export async function authenticateManage(
  request: Request,
): Promise<schema.Agent | null> {
  const token = extractBearerToken(request.headers);
  if (!token) return null;
  return resolveAgentByManageToken(token);
}
