import { generateAgentInstructions } from "../session/generate-agent";
import { json, type RouteContext, readJson } from "./http-helpers";

/**
 * `POST /generate-agent` — the Create-with-AI one-shot. Errors answer 400 with
 * the real reason (no provider connected, model reply unparseable, …) so the
 * create dialog can show it — user-initiated work, beta no-silent-failure.
 */
export async function handleGenerateRoute(ctx: RouteContext): Promise<boolean> {
  if (ctx.method !== "POST" || ctx.path !== "/generate-agent") return false;

  const { description, provider, model } = await readJson(ctx.req);
  if (typeof description !== "string" || !description.trim()) {
    json(ctx.res, 400, { error: "missing 'description'" });
    return true;
  }
  try {
    const result = await generateAgentInstructions(description, {
      provider: typeof provider === "string" ? provider : undefined,
      model: typeof model === "string" ? model : undefined,
    });
    json(ctx.res, 200, result);
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
