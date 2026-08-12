import { authStorage } from "../auth/storage";
import { json, type RouteContext, readJson } from "./http-helpers";

/**
 * Narrow rollback for a failed API-key connect (PRODUCT-1321).
 *
 * The host's connect pushes the pasted key here FIRST (the runtime
 * live-verifies and persists it — provider-routes.ts handleApiKey), and only
 * then stores it centrally. When that central PUT fails, the runtime is left
 * holding a verified, usable key the central store never learned about: it is
 * absent from `served-providers.json`, so an authoritative central 404 can
 * never remove it (serve.ts's provenance gate), and it silently vanishes with
 * the pod's next recycle — the "spontaneous disconnect". The host calls
 * DELETE /auth/:provider/api-key to take the just-written key back out, so a
 * failed connect leaves NO local residue and the user's connect error is the
 * whole story.
 *
 * Guarded by the key itself: only the exact credential this connect wrote is
 * removed. A concurrent connect that stored a DIFFERENT key — or a served
 * OAuth entry — is left alone (`removed: false`, still a 200: rollback is a
 * convergence op, not an assertion).
 */
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
  // Attribution for the runtime.log: this is the ONLY writer besides logout
  // that clears a credential — name the moment (the key itself is never logged).
  console.log(
    `[auth] rolling back the just-connected ${provider} API key: the central store rejected the connect (DELETE /auth/${provider}/api-key)`,
  );
  // `delete` queues on the store's per-provider chain (same rationale as
  // logout) and drops the in-memory cache entry with the file's.
  await authStorage.delete(provider);
  json(ctx.res, 200, { ok: true, removed: true });
}
