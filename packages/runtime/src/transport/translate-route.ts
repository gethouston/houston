import { translateTexts } from "../session/translate";
import { json, type RouteContext, readJson } from "./http-helpers";

const TARGET = /^[a-z]{2}(-[A-Za-z0-9-]{1,8})?$/;

/**
 * `POST /skills/translate` — the AI translation pass behind the post-install
 * "translate this skill" offer (HOU-733). The host splits the SKILL.md and
 * sends the human-language surfaces here (the runtime is where provider
 * credentials live). Errors answer 400 with the real reason (no provider
 * connected, model reply unparseable, …) so the host can surface why —
 * user-initiated work, beta no-silent-failure.
 */
export async function handleTranslateRoute(
  ctx: RouteContext,
): Promise<boolean> {
  if (ctx.method !== "POST" || ctx.path !== "/skills/translate") return false;

  const { items, targetLanguage } = await readJson(ctx.req);
  if (
    !Array.isArray(items) ||
    !items.every(
      (i: unknown): i is { id: string; text: string } =>
        !!i &&
        typeof i === "object" &&
        typeof (i as { id?: unknown }).id === "string" &&
        typeof (i as { text?: unknown }).text === "string",
    )
  ) {
    json(ctx.res, 400, { error: "missing 'items' [{id, text}] array" });
    return true;
  }
  if (typeof targetLanguage !== "string" || !TARGET.test(targetLanguage)) {
    json(ctx.res, 400, { error: "missing or invalid 'targetLanguage'" });
    return true;
  }
  try {
    json(ctx.res, 200, { items: await translateTexts(items, targetLanguage) });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
