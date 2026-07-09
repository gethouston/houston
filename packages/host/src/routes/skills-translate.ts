import type { IncomingMessage, ServerResponse } from "node:http";
import {
  composeTranslatedSkillMd,
  loadSkillDetail,
  type SkillTranslateSegment,
  skillKey,
  skillTranslateSegments,
} from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { Agent, Workspace } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import type { RuntimeChannel } from "../ports";
import {
  machineTranslate,
  type TextTranslator,
} from "../skills/machine-translate";
import type { Vfs } from "../vfs";
import { json, readJson } from "./http";

const TARGET = /^[a-z]{2}(-[A-Za-z0-9-]{1,8})?$/;

/**
 * POST .../skills/:slug/translate — the post-install "translate this skill"
 * offer (HOU-733). Splits the SKILL.md into its human-language surfaces,
 * translates them in the requested mode, and rebuilds the file with identity
 * and bookkeeping untouched:
 *
 * - `machine`: the quick free pass, host-side (no provider needed).
 * - `ai`: the better-quality pass, run in the agent's runtime via the
 *   channel (where the provider credential lives). Channels without a
 *   standing runtime answer 503 with the reason.
 *
 * Errors carry the real reason — user-initiated work, beta
 * no-silent-failure. Returns true when handled.
 */
export async function handleSkillTranslate(
  deps: {
    vfs?: Vfs;
    paths: WorkspacePaths;
    channel?: RuntimeChannel;
    /** Injected in tests; production uses the free gtx translator. */
    translator?: TextTranslator;
  },
  ctx: { workspace: Workspace; agent: Agent },
  method: string,
  rest: string,
  req: IncomingMessage,
  res: ServerResponse,
  emit?: (event: HoustonEvent) => void,
): Promise<boolean> {
  const m = rest.match(/^skills\/([^/]+)\/translate$/);
  if (!m || method !== "POST") return false;
  const slug = decodeURIComponent(m[1] ?? "");

  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const body = await readJson(req);
  const target = typeof body.target === "string" ? body.target : "";
  const mode =
    body.mode === "ai" ? "ai" : body.mode === "machine" ? "machine" : null;
  if (!TARGET.test(target)) {
    json(res, 400, { error: "missing or invalid 'target' language" });
    return true;
  }
  if (!mode) {
    json(res, 400, { error: "'mode' must be 'machine' or 'ai'" });
    return true;
  }

  const root = deps.paths.agentRoot(ctx.workspace, ctx.agent);
  const original = await deps.vfs.readText(skillKey(root, slug));
  if (original === null) {
    json(res, 404, { error: "skill not found" });
    return true;
  }
  const segments = skillTranslateSegments(slug, original);
  if ("error" in segments) {
    json(res, 422, { error: segments.error });
    return true;
  }
  if (segments.length === 0) {
    // Nothing translatable; answer with the unchanged detail.
    json(res, 200, await loadSkillDetail(deps.vfs, root, slug));
    return true;
  }

  let results: { id: string; text: string }[];
  try {
    if (mode === "ai") {
      if (!deps.channel?.translateTexts) {
        json(res, 503, {
          error: "AI translation is not available on this deployment",
        });
        return true;
      }
      results = await deps.channel.translateTexts(ctx, segments, target);
    } else {
      const translator = deps.translator ?? machineTranslate;
      const texts = await translator(
        segments.map((s) => s.text),
        target,
      );
      // A short reply would silently leave a surface untranslated (pick()
      // keeps the original on empty) — hard-fail like the AI parser does.
      if (texts.length !== segments.length) {
        throw new Error(
          `translator returned ${texts.length} of ${segments.length} texts`,
        );
      }
      results = segments.map((s, i) => ({ id: s.id, text: texts[i] ?? "" }));
    }
  } catch (e) {
    json(res, 502, { error: e instanceof Error ? e.message : String(e) });
    return true;
  }

  const translated: Partial<Record<SkillTranslateSegment["id"], string>> = {};
  for (const r of results) {
    if (r.id === "title" || r.id === "description" || r.id === "body")
      translated[r.id] = r.text;
  }
  const rebuilt = composeTranslatedSkillMd({ slug, original, translated });
  if (typeof rebuilt !== "string") {
    json(res, 422, { error: rebuilt.error });
    return true;
  }
  await deps.vfs.writeText(skillKey(root, slug), rebuilt);
  emit?.({ type: "SkillsChanged", agentPath: ctx.agent.id });
  json(res, 200, await loadSkillDetail(deps.vfs, root, slug));
  return true;
}
