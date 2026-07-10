/**
 * GET /api/agents/:slug/bundle?target=claude-skill-zip|copy-paste
 *
 * Streams the published agent's export payload built from its immutable IR
 * snapshot. Records an anonymous install event; the agent_installs_count trigger
 * increments the counter — app code MUST NOT. Published + non-deleted only.
 * Rate-limited 60/min/IP.
 */

import * as schema from "@/db/schema";
import { json } from "@/lib/agents/http";
import { getPublishedAgentBySlug } from "@/lib/agents/resolve";
import { db } from "@/lib/db";
import {
  defaultExportTarget,
  type ExportResult,
  ExportSecretLeakError,
  type ExportTargetId,
  isExportTargetId,
  runExport,
} from "@/lib/export";
import { clientIpFromHeaders, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Map an export-target id (hyphenated) to the install_target enum (underscored). */
const INSTALL_TARGET_BY_EXPORT: Record<
  ExportTargetId,
  (typeof schema.installTarget.enumValues)[number]
> = {
  "claude-skill-zip": "claude_skill_zip",
  "copy-paste": "copy_paste",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  const ip = clientIpFromHeaders(request.headers);
  if (!rateLimit(`agents:bundle:${ip}`, 60, 60_000)) {
    return json({ error: "rate_limited" }, 429);
  }

  const rawTarget =
    new URL(request.url).searchParams.get("target") || defaultExportTarget;
  if (!isExportTargetId(rawTarget)) {
    return json({ error: "bad_target" }, 400);
  }
  const target = rawTarget;

  const { agent: slug } = await params;
  const resolved = await getPublishedAgentBySlug(slug);
  if (!resolved) return json({ error: "not_found" }, 404);
  const { agent, ir } = resolved;

  let result: ExportResult;
  try {
    ({ result } = await runExport(target, ir, { block: true }));
  } catch (err) {
    if (err instanceof ExportSecretLeakError) {
      return json({ error: "secrets_detected", findings: err.findings }, 422);
    }
    throw err;
  }

  // Record the anonymous install (best-effort). The trigger owns the counter; a
  // telemetry failure must never fail the download, but it is logged, not hidden.
  try {
    await db.insert(schema.agentInstalls).values({
      agentId: agent.id,
      versionId: agent.publishedVersionId,
      target: INSTALL_TARGET_BY_EXPORT[target],
    });
  } catch (err) {
    console.error("agentstore: failed to record install", err);
  }

  const headers = new Headers({
    "content-type": result.contentType,
    "content-disposition": `attachment; filename="${result.filename}"`,
    "cache-control": "private, no-store",
  });

  if (result.kind === "zip") {
    return new Response(new Uint8Array(result.bytes), { status: 200, headers });
  }
  return new Response(result.text, { status: 200, headers });
}
