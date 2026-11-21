import { identityConfig } from "./identity";

type WebIdentity = typeof import("@houston/web-identity");

let loaded: WebIdentity | null = null;

export async function webIdentity(): Promise<WebIdentity> {
  const web = await import("@houston/web-identity");
  web.initWebAuth(identityConfig);
  loaded = web;
  return web;
}

export function loadedWebIdentity(): WebIdentity | null {
  return loaded;
}
