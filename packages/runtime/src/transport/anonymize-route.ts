import { anonymizeTexts } from "../session/anonymize";
import { json, type RouteContext, readJson } from "./http-helpers";

/**
 * `POST /portable/anonymize` — the AI redaction pass behind the export
 * wizard's "Help me anonymize". The host gathers + regex-pre-redacts the
 * selected content and sends the texts here (the runtime is where provider
 * credentials live). Errors answer 400 with the real reason (no provider
 * connected, model reply unparseable, …) so the host can fall back to the
 * regex-only result and tell the user why — beta no-silent-failure.
 */
export async function handleAnonymizeRoute(
  ctx: RouteContext,
): Promise<boolean> {
  if (ctx.method !== "POST" || ctx.path !== "/portable/anonymize") return false;

  const { items } = await readJson(ctx.req);
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
  try {
    json(ctx.res, 200, { items: await anonymizeTexts(items) });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
