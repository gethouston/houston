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
 * The export wizard's "Help me anonymize" pass. Gathers the selected content
 * off the vfs, regex-pre-redacts it, and runs the AI redactor. When the AI
 * pass can't run — no runner on this deployment, no provider connected,
 * unparseable model reply — the regex-only result ships instead WITH the
 * reason (`mode: "patterns"`, `aiError`), so the wizard can say so (beta
 * no-silent-failure). Read-only: nothing on the agent changes; the accepted
 * diffs come back as `overrides` on the export call.
 *
 * The core is surface-agnostic: the pod route runs `ai` through the agent's
 * runtime channel; a pool worker runs it through a turn-local model runtime
 * (runtime turn/op-anonymize.ts). One body grammar, one fallback policy.
 */
export type AnonymizeAiRunner = (
  items: { id: string; text: string }[],
) => Promise<{ id: string; text: string; summary: string }[]>;

export async function runPortableAnonymize(
  deps: {
    vfs: Vfs;
    root: string;
    ai?: AnonymizeAiRunner;
    /** Errors this surface must handle outside the patterns fallback. */
    rethrowAiError?: (error: unknown) => boolean;
    /** Surface-specific `aiError` copy when no runner exists at all. */
    aiUnavailableReason?: string;
  },
  body: PortableAnonymizeRequest,
): Promise<PortableAnonymizeResponse> {
  // Untrusted wizard input — normalize before reuse as a selection.
  const content = await gatherPortableContent(deps.vfs, deps.root, {
    includeClaudeMd: Boolean(body.claudeMd),
    skillSlugs: Array.isArray(body.skillSlugs) ? body.skillSlugs : [],
    routineIds: Array.isArray(body.routineIds) ? body.routineIds : [],
    learningIds: Array.isArray(body.learningIds) ? body.learningIds : [],
  });

  // Credentials are scrubbed by secretlint in BOTH modes — inside the items
  // sent to the model AND in the patterns fallback.
  // `useAi: false` is the wizard toggle: a deliberate patterns-only run, so
  // no `aiError` rides the response (nothing failed).
  const wantAi = body.useAi !== false;
  const items = wantAi
    ? await collectAnonymizeItems(content, redactSecrets)
    : [];
  if (!wantAi || items.length === 0) {
    return anonymizeContent(content, redactSecrets);
  }
  if (!deps.ai) {
    return {
      ...(await anonymizeContent(content, redactSecrets)),
      aiError:
        deps.aiUnavailableReason ??
        "AI anonymization is not available on this deployment",
    };
  }
  try {
    const results = await deps.ai(items);
    return await mergeAnonymizeResults(
      content,
      new Map<string, AnonymizeAiResult>(
        results.map((r) => [r.id, { text: r.text, summary: r.summary }]),
      ),
      redactSecrets,
    );
  } catch (e) {
    if (deps.rethrowAiError?.(e)) throw e;
    return {
      ...(await anonymizeContent(content, redactSecrets)),
      aiError: e instanceof Error ? e.message : String(e),
    };
  }
}

/** POST .../portable/anonymize on the pod's dispatch surface. Returns true
 *  when handled. */
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
  const body = (await readJson(req)) as unknown as PortableAnonymizeRequest;
  const channel = deps.channel;
  const response = await runPortableAnonymize(
    {
      vfs: deps.vfs,
      root,
      // The channel carries the AI pass into the agent's runtime; absent
      // (or unsupported) the core falls back to the regex redactor.
      ...(channel?.anonymizeTexts
        ? {
            ai: (items: { id: string; text: string }[]) =>
              // biome-ignore lint/style/noNonNullAssertion: guarded by the spread condition
              channel.anonymizeTexts!(ctx, items),
          }
        : {}),
    },
    body,
  );
  json(res, 200, response);
  return true;
}
