/// <reference types="vite/client" />

/**
 * The window globals the adapter READS, declared where they are read.
 *
 * Both are written before the adapter's module graph loads, and each surface
 * declares them again for its own program (`app/src/lib/engine.ts`,
 * `app/src/lib/store-gateway-session.ts`, `packages/web/src/vite-env.d.ts`).
 * These declarations must stay shape-identical with those: TypeScript merges
 * the interfaces, and a divergent member is an error at the merge, not a
 * silent widening.
 */
interface Window {
  /** The engine endpoint the session is pointed at (baseUrl + bearer). */
  __HOUSTON_ENGINE__?: { baseUrl: string; token: string };
  /**
   * Store gateway target installed by the desktop shell when the engine is a
   * local sidecar (the gateway is elsewhere). Absent on hosted/web, where the
   * engine baseUrl + bearer already point at the gateway.
   */
  __HOUSTON_STORE__?: { baseUrl: string; token: string };
}
