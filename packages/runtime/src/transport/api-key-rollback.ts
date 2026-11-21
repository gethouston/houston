import { authStorage } from "../auth/storage";
import { json, type RouteContext, readJson } from "./http-helpers";

export async function handleApiKeyRollback(
  ctx: RouteContext,
  provider: string,
): Promise<void> {
  const body = await readJson(ctx.req).catch(() => ({}) as never);
  const raw = (body as { key?: unknown }).key;
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!key) {
    json(ctx.res, 400, { error: "missing API key" });
    return;
  }
  const cred = authStorage.get(provider) as
    | { type?: string; key?: string }
    | undefined;
  if (cred?.type !== "api_key" || cred.key !== key) {
    json(ctx.res, 200, { ok: true, removed: false });
    return;
  }
  console.log(
    `[auth] rolling back the just-connected ${provider} API key: the central store rejected the connect (DELETE /auth/${provider}/api-key)`,
  );
  await authStorage.delete(provider);
  json(ctx.res, 200, { ok: true, removed: true });
}
