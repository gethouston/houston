/**
 * GET /api/agents/:slug/ir — the canonical machine-readable AgentIR.
 *
 * A thin public proxy of the gateway's IR snapshot: the store frontend has no
 * database, but the install instructions and receiving assistants need a stable,
 * bare-IR JSON URL on the store origin (the gateway's agent endpoint returns a
 * wrapper object). Published + non-deleted only (unlisted IS served — the link is
 * the grant). Read-only.
 */

import { artifactCors, corsPreflight } from "@/lib/proxy-headers";
import { getAgentIr } from "@/lib/store-api";

export const dynamic = "force-dynamic";

export function OPTIONS(): Response {
  return corsPreflight();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  const { agent: slug } = await params;
  const ir = await getAgentIr(slug);
  if (!ir) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: {
        ...artifactCors(),
        "content-type": "application/json; charset=utf-8",
      },
    });
  }

  return new Response(JSON.stringify(ir), {
    status: 200,
    headers: {
      ...artifactCors(),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
