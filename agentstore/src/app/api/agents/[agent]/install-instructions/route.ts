/**
 * GET /api/agents/:slug/install-instructions — the copy-paste block that tells a
 * receiving assistant to FETCH this agent's IR/bundle from our public URLs and set
 * it up locally, framing everything fetched as untrusted data. Built from the IR
 * snapshot fetched from the gateway. Published + non-deleted only. Read-only.
 */

import { buildInstallInstructions } from "@/lib/install/instructions";
import { artifactCors, corsPreflight } from "@/lib/proxy-headers";
import { siteBase } from "@/lib/site-config";
import { getAgentBySlug } from "@/lib/store-api";

export const dynamic = "force-dynamic";

export function OPTIONS(): Response {
  return corsPreflight();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  const { agent: slug } = await params;
  const detail = await getAgentBySlug(slug);
  if (!detail?.agent.slug) {
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: {
        ...artifactCors(),
        "content-type": "application/json; charset=utf-8",
      },
    });
  }

  const base = siteBase();
  const s = encodeURIComponent(detail.agent.slug);
  const text = buildInstallInstructions(detail.ir, {
    irUrl: `${base}/api/agents/${s}/ir`,
    bundleUrl: `${base}/api/agents/${s}/bundle?target=claude-skill-zip`,
    pageUrl: `${base}/a/${s}`,
  });

  return new Response(text, {
    status: 200,
    headers: {
      ...artifactCors(),
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
