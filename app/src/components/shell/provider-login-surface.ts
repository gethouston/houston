/**
 * Who acts on a `ProviderLoginUrl` event (HOU-676).
 *
 * On the v3 wire the runtime can't touch the user's browser: the adapter
 * surfaces the OAuth URL as a bus event and expects the ACTIVE view to act on
 * it. The AI hub, the provider picker, and the onboarding login step each
 * mount a handler — but a login can also be launched from surfaces that don't
 * (the in-chat reconnect card, the store-driven card), and an event nobody
 * consumes is a sign-in button that silently does nothing.
 *
 * So the shell mounts ONE global fallback (`ProviderLoginFallback`), and every
 * dedicated login surface CLAIMS the event while mounted. The fallback acts
 * only when no claim is held — never alongside a dedicated surface, which
 * would double-open the browser or stack two dialogs.
 */

let claims = 0;

/** Mark a dedicated login surface as mounted. Returns the release function. */
export function claimProviderLoginSurface(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
  };
}

/** Whether any dedicated login surface currently owns `ProviderLoginUrl`. */
export function providerLoginSurfaceClaimed(): boolean {
  return claims > 0;
}

/**
 * What the global fallback should do with a `ProviderLoginUrl` event:
 * nothing when a dedicated surface owns the event; otherwise open the
 * browser directly on desktop loopback flows (no code to show), or surface
 * the dialog for device-code / remote flows. Mirrors the dedicated
 * handlers' own branch (`shouldOpenLoginUrlDirectly`).
 */
export function providerLoginFallbackAction(opts: {
  claimed: boolean;
  isDesktop: boolean;
  userCode: string | null | undefined;
}): "ignore" | "open" | "dialog" {
  if (opts.claimed) return "ignore";
  return opts.isDesktop && !opts.userCode ? "open" : "dialog";
}
