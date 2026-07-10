/**
 * GET /api/schema/agent — the AgentIR 2.0.0 JSON Schema (Draft 2020-12).
 *
 * Served with long cache headers so agents/tooling can fetch the schema referenced
 * by POST /api/agents (`schemaUrl`) to shape a valid submission.
 */
import { agentIrJsonSchema } from "@houston/agentstore-contract";
import { json } from "@/lib/agents/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return json(agentIrJsonSchema, 200, {
    "content-type": "application/schema+json; charset=utf-8",
    "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400",
  });
}
