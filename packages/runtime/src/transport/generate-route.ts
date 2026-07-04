import { generateInstructions } from "../session/generate-instructions";
import { json, type RouteContext, readJson } from "./http-helpers";

/**
 * `POST /generate-instructions` — AI-assisted agent creation: description in,
 * `{ name, instructions, suggestedIntegrations, suggestedRoutine }` out.
 * Errors surface as a 400 with the real reason (the client toasts it) — this
 * is user-initiated work, never a silent empty fallback.
 */
export async function handleGenerateRoute(ctx: RouteContext): Promise<boolean> {
  if (ctx.method !== "POST" || ctx.path !== "/generate-instructions")
    return false;

  const { description, model } = await readJson(ctx.req);
  if (!description || typeof description !== "string") {
    json(ctx.res, 400, { error: "missing 'description'" });
    return true;
  }
  try {
    const result = await generateInstructions(
      description,
      typeof model === "string" ? model : undefined,
    );
    json(ctx.res, 200, result);
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
