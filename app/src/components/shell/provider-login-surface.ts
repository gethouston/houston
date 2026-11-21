let claims = 0;

export function claimProviderLoginSurface(): () => void {
  claims += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    claims -= 1;
  };
}

export function providerLoginSurfaceClaimed(): boolean {
  return claims > 0;
}

export function providerLoginFallbackAction(opts: {
  claimed: boolean;
  isDesktop: boolean;
  userCode: string | null | undefined;
  authCode?: boolean;
}): "ignore" | "open" | "dialog" {
  if (opts.claimed) return "ignore";
  return opts.isDesktop && !opts.userCode && !opts.authCode ? "open" : "dialog";
}
