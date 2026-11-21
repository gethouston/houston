import { generateAgentInstructions } from "../session/generate-agent";
import { json, type RouteContext, readJson } from "./http-helpers";

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
