/**
 * GET /api/agents/:slug/install-instructions — the copy-paste block that tells a
 * receiving assistant to FETCH this agent's IR/bundle from our public URLs and set
 * it up locally, framing everything fetched as untrusted data. Published +
 * non-deleted agents only. Read-only, no side effect.
 */

import { json } from "@/lib/agents/http";
import {
  buildAgentInstallUrls,
  getPublishedAgentBySlug,
} from "@/lib/agents/resolve";
import { buildInstallInstructions } from "@/lib/install/instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  const { agent: slug } = await params;
  const resolved = await getPublishedAgentBySlug(slug);
  if (!resolved?.agent.slug) return json({ error: "not_found" }, 404);

  const urls = buildAgentInstallUrls(resolved.agent.slug);
  const text = buildInstallInstructions(resolved.ir, {
    irUrl: urls.irUrl,
    bundleUrl: urls.bundleUrl,
    pageUrl: urls.pageUrl,
  });

  return new Response(text, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
