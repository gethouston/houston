import { serveBrowserInput, serveBrowserLive } from "./browser-live-http";
import type { RouteContext } from "./http-helpers";

export async function handleBrowserLiveRoute(
  ctx: RouteContext,
): Promise<boolean> {
  const liveMatch = ctx.path.match(/^\/conversations\/([^/]+)\/browser\/live$/);
  if (ctx.method === "GET" && liveMatch) {
    serveBrowserLive(
      ctx.req,
      ctx.res,
      decodeURIComponent(liveMatch[1]),
      ctx.url,
    );
    return true;
  }
  const inputMatch = ctx.path.match(
    /^\/conversations\/([^/]+)\/browser\/input$/,
  );
  if (ctx.method === "POST" && inputMatch) {
    await serveBrowserInput(
      ctx.req,
      ctx.res,
      decodeURIComponent(inputMatch[1]),
    );
    return true;
  }
  return false;
}
