import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type AnonymizeAiResult,
  anonymizeContent,
  collectAnonymizeItems,
  mergeAnonymizeResults,
} from "@houston/domain";
import type {
  PortableAnonymizeRequest,
  PortableAnonymizeResponse,
} from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { RuntimeChannel } from "../ports";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";
import { gatherPortableContent } from "./portable-content";
import { redactSecrets } from "./portable-secrets";

/**
 * POST .../portable/anonymize — the export wizard's "Help me anonymize"
 * pass. Gathers the selected content off the vfs, regex-pre-redacts it, and
 * runs the AI redactor in the agent's runtime (where the provider credential
 * lives). When the AI pass can't run — no channel support, no provider
 * connected, unparseable model reply — the regex-only result ships instead
 * WITH the reason (`mode: "patterns"`, `aiError`), so the wizard can say so
 * (beta no-silent-failure). Read-only: nothing on the agent changes; the
 * accepted diffs come back as `overrides` on the export call. Returns true
 * when handled.
 */
export async function handlePortableAnonymize(
  deps: { vfs?: Vfs; paths?: WorkspacePaths; channel?: RuntimeChannel },
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  if (rest !== "portable/anonymize" || method !== "POST") return false;
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const paths = deps.paths ?? new CloudPaths();
  const root = paths.agentRoot(ctx.workspace, ctx.agent);
  // Untrusted wizard input — normalize before reuse as a selection.
  const body = (await readJson(req)) as unknown as PortableAnonymizeRequest;
  const content = await gatherPortableContent(deps.vfs, root, {
    includeClaudeMd: Boolean(body.claudeMd),
    skillSlugs: Array.isArray(body.skillSlugs) ? body.skillSlugs : [],
    routineIds: Array.isArray(body.routineIds) ? body.routineIds : [],
    learningIds: Array.isArray(body.learningIds) ? body.learningIds : [],
  });

  // Credentials are scrubbed by secretlint in BOTH modes — inside the items
  // sent to the model AND in the patterns fallback.
  const items = await collectAnonymizeItems(content, redactSecrets);
  let response: PortableAnonymizeResponse;
  if (items.length === 0) {
    response = await anonymizeContent(content, redactSecrets);
  } else if (!deps.channel?.anonymizeTexts) {
    response = {
      ...(await anonymizeContent(content, redactSecrets)),
      aiError: "AI anonymization is not available on this deployment",
    };
  } else {
    try {
      const results = await deps.channel.anonymizeTexts(ctx, items);
      response = await mergeAnonymizeResults(
        content,
        new Map<string, AnonymizeAiResult>(
          results.map((r) => [r.id, { text: r.text, summary: r.summary }]),
        ),
        redactSecrets,
      );
    } catch (e) {
      response = {
        ...(await anonymizeContent(content, redactSecrets)),
        aiError: e instanceof Error ? e.message : String(e),
      };
    }
  }
  json(res, 200, response);
  return true;
}
