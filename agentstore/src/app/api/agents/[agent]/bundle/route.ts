import type { StoreInstallTarget } from "@houston/agentstore-client";
import {
  defaultExportTarget,
  type ExportResult,
  ExportSecretLeakError,
  type ExportTargetId,
  isExportTargetId,
  runExport,
} from "@/lib/export";
import {
  artifactCors,
  clientIpFromHeaders,
  corsPreflight,
} from "@/lib/proxy-headers";
import { getAgentBySlug, recordInstall } from "@/lib/store-api";

export const dynamic = "force-dynamic";

export function OPTIONS(): Response {
  return corsPreflight();
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      ...artifactCors(),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

const INSTALL_TARGET_BY_EXPORT: Record<ExportTargetId, StoreInstallTarget> = {
  "claude-skill-zip": "claude_skill_zip",
  "copy-paste": "copy_paste",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ agent: string }> },
): Promise<Response> {
  const rawTarget =
    new URL(request.url).searchParams.get("target") || defaultExportTarget;
  if (!isExportTargetId(rawTarget)) return jsonError("bad_target", 400);
  const target = rawTarget;

  const { agent: slug } = await params;
  const detail = await getAgentBySlug(slug);
  if (!detail) return jsonError("not_found", 404);

  let result: ExportResult;
  try {
    ({ result } = await runExport(target, detail.ir, { block: true }));
  } catch (err) {
    if (err instanceof ExportSecretLeakError) {
      return new Response(
        JSON.stringify({ error: "secrets_detected", findings: err.findings }),
        {
          status: 422,
          headers: {
            ...artifactCors(),
            "content-type": "application/json; charset=utf-8",
          },
        },
      );
    }
    throw err;
  }

  try {
    await recordInstall(slug, INSTALL_TARGET_BY_EXPORT[target], {
      clientIp: clientIpFromHeaders(request.headers),
    });
  } catch (err) {
    console.error("agentstore: failed to record install", err);
  }

  const headers = new Headers({
    ...artifactCors(),
    "content-type": result.contentType,
    "content-disposition": `attachment; filename="${result.filename}"`,
    "cache-control": "private, no-store",
  });

  if (result.kind === "zip") {
    return new Response(new Uint8Array(result.bytes), { status: 200, headers });
  }
  return new Response(result.text, { status: 200, headers });
}
