/**
 * The two web-side facts about the custom-integration family that the SDK
 * deliberately does not carry: how its two route families are spelled (so
 * `viaSdk` can key its translation and the stuck-wake tracker on the path the
 * call issues), and what a 404 means to this app.
 */

import { HoustonEngineError } from "./errors";

/** The user-scoped form, served by a direct host. */
export const customPath = (...segments: string[]) =>
  `/v1/integrations/custom/${segments.map(encodeURIComponent).join("/")}`;

/** The per-agent dispatch form, which a hosted gateway proxies to the pod. */
export const agentCustomPath = (agent: string, ...segments: string[]) =>
  `/agents/${encodeURIComponent(agent)}/integrations/custom/${segments.map(encodeURIComponent).join("/")}`;

/** A deployment without the custom-integrations surface (older host) answers
 *  404 on the definitions read; that is a legitimate "feature absent" shape, so
 *  it maps to null (the section stays hidden) rather than surfacing an error.
 *  The write routes have no such fallback — a failure there is a real failure. */
export async function whenServed<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (err instanceof HoustonEngineError && err.status === 404) return null;
    throw err;
  }
}

/** The tools read's 404 is TWO answers: a bare one is the absent route family
 *  (→ null, mirroring {@link whenServed}); `{code:"not_found"}` marks an
 *  UNKNOWN SLUG — the definition was removed concurrently — and stays a real
 *  failure. */
export async function whenSlugKnown<T>(
  read: () => Promise<T>,
): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    if (
      err instanceof HoustonEngineError &&
      err.status === 404 &&
      (err.body as { code?: string } | null)?.code !== "not_found"
    )
      return null;
    throw err;
  }
}
