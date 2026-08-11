/**
 * Build identity: the desktop identifies its build with
 * `X-Houston-App-Version: <semver>+<channel>` on every gateway request. The
 * gateway no longer acts on the header (the server-side min-app-version 426
 * gate was retired, PRODUCT-1144) — it stays for log/build identity and
 * because every target's CORS allow-set already admits it.
 *
 * The value rides a window global — the same global-injection idiom as
 * `__HOUSTON_SESSION_REFRESH__` — because this adapter is bundled into the web
 * app too and must not import desktop code: the desktop shell
 * (`app/src/lib/app-version.ts` via `engine.ts`) installs the header value,
 * gated on `osIsTauri()` — the web bundle loads the same shell module, so the
 * gate (not bundle separation) is what keeps a browser tab from ever sending
 * the header. That matters beyond scope hygiene: the custom header makes every
 * fetch CORS-preflighted, so each target that may receive it (gateway, engine
 * host, fake host) must allow it explicitly — a browser client sending it to a
 * host that doesn't would lose ALL requests, not just the header.
 */

declare global {
  interface Window {
    /** Full header value `<semver>+<channel>` (e.g. `0.5.9+cloud`), baked by
     *  the desktop shell at module load. Absent → no header (web, tests). */
    __HOUSTON_APP_VERSION__?: string;
  }
}

/** The `X-Houston-App-Version` value to send, or null to send no header. */
export function appVersionHeader(): string | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_APP_VERSION__ ?? null;
}
