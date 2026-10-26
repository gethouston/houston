// The web Firebase Auth surface, loaded on first use so firebase-js-sdk stays
// out of the boot chunk. Desktop resolves the specifier to a stub that throws,
// so only `!osIsTauri()` paths call this.

import { identityConfig } from "./identity";

type WebIdentity = typeof import("@houston/web-identity");

let loaded: WebIdentity | null = null;

export async function webIdentity(): Promise<WebIdentity> {
  const web = await import("@houston/web-identity");
  web.initWebAuth(identityConfig);
  loaded = web;
  return web;
}

/** The surface, when a sign-in has already loaded it. */
export function loadedWebIdentity(): WebIdentity | null {
  return loaded;
}
