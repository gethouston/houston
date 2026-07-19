/**
 * The app-update-floor seam: the hosted gateway may enforce a per-channel
 * minimum app version. The desktop identifies its build with
 * `X-Houston-App-Version: <semver>+<channel>` on every gateway request, and a
 * gateway that decides the caller is below the floor answers ANY request
 * (except `/v1/version` and health) with `426 Upgrade Required` +
 * `{error, minVersion, updateUrl}`.
 *
 * Both directions ride window globals — the same global-injection idiom as
 * `__HOUSTON_SESSION_REFRESH__` — because this adapter is bundled into the web
 * app too and must not import desktop code: the desktop shell
 * (`app/src/lib/update-floor.ts` via `engine.ts`) installs the header value and
 * the 426 forwarder, gated on `osIsTauri()` — the web bundle loads the same
 * shell module, so the gate (not bundle separation) is what keeps a browser
 * tab from ever sending the header or tripping the blocking update screen.
 * That matters beyond scope hygiene: the custom header makes every fetch
 * CORS-preflighted, so each target that may receive it (gateway, engine host,
 * fake host) must allow it explicitly — a browser client sending it to a host
 * that doesn't would lose ALL requests, not just the header.
 */

declare global {
  interface Window {
    /** Full header value `<semver>+<channel>` (e.g. `0.5.9+cloud`), baked by
     *  the desktop shell at module load. Absent → no header (web, tests). */
    __HOUSTON_APP_VERSION__?: string;
    /** Desktop-installed sink for a gateway `426 Upgrade Required`; feeds the
     *  blocking update screen. Absent → the 426 just surfaces as an error. */
    __HOUSTON_UPDATE_REQUIRED__?: (signal: {
      minVersion: string | null;
      updateUrl: string | null;
    }) => void;
  }
}

/** The `X-Houston-App-Version` value to send, or null to send no header. */
export function appVersionHeader(): string | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_APP_VERSION__ ?? null;
}

/**
 * Forward a gateway `426 Upgrade Required` to the desktop shell's sink (when
 * one is installed) and hand the response back unchanged, so callers keep
 * their normal error path — the blocking screen takes over the UI; the failed
 * call itself still fails. Parsing is fire-and-forget on a clone: the caller's
 * own body read must not be consumed here.
 */
export function noteUpgradeRequired(res: Response): Response {
  if (res.status !== 426) return res;
  const notify =
    typeof window !== "undefined"
      ? window.__HOUSTON_UPDATE_REQUIRED__
      : undefined;
  if (!notify) return res;
  void res
    .clone()
    .json()
    .catch(() => null)
    .then((body: unknown) => {
      const b = body as { minVersion?: unknown; updateUrl?: unknown } | null;
      notify({
        minVersion:
          typeof b?.minVersion === "string" && b.minVersion
            ? b.minVersion
            : null,
        // `updateUrl` may be empty by contract — normalize that to null.
        updateUrl:
          typeof b?.updateUrl === "string" && b.updateUrl ? b.updateUrl : null,
      });
    });
  return res;
}
