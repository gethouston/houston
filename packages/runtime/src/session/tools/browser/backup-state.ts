import type { StorageState } from "./state-merge";

const WALL_COOKIE =
  /^(?:__cf_bm|cf_clearance|_abck|bm_sz|bm_sv|ak_bmsc|_px\w*|pxcts|datadome|incap_ses_\w*|visid_incap_\w*|nlbi_\w*|aws-waf-token)$/;

export function backupState(state: StorageState, host: string): StorageState {
  return {
    cookies: state.cookies.filter(
      (c) => !WALL_COOKIE.test(c.name) && sameSite(c.domain, host),
    ),
    origins: state.origins.filter((o) => sameSite(originHost(o.origin), host)),
  };
}

function sameSite(domain: string, host: string): boolean {
  const d = domain.replace(/^\./, "").toLowerCase();
  const h = host.toLowerCase();
  if (!d || !h) return false;
  const site = h.replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`) || d === site || d.endsWith(`.${site}`);
}

function originHost(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return "";
  }
}
