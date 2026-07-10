/**
 * GET /api/agents/:slug/ir — the canonical machine-readable AgentIR.
 *
 * The artifact a receiving assistant fetches per the install instructions.
 * Published + non-deleted agents only (unlisted IS served — the link is the grant).
 */

import { json } from "@/lib/agents/http";
import { getPublishedAgentBySlug } from "@/lib/agents/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  const { agent: slug } = await params;
  const resolved = await getPublishedAgentBySlug(slug);
  if (!resolved) return json({ error: "not_found" }, 404);

  return json(resolved.ir, 200, {
    "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
  });
}
