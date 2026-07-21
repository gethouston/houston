import { type NextRequest, NextResponse } from "next/server";

/**
 * Vanity creator URLs: `/@handle` is the canonical, shareable address of a
 * creator's public page, internally served by `/creators/[handle]`. We REWRITE
 * (not redirect) so the address bar keeps the pretty `/@handle` while the app
 * renders the real route. The pattern mirrors the gateway's handle grammar
 * (`^[a-z0-9][a-z0-9_]{1,29}$` — lowercase, 2–30 chars); anything else falls
 * through untouched (a bad handle 404s on the real page). The `@` is percent
 * decoded to `%40` by browsers in some cases, so we match both forms.
 */
const HANDLE_PATH = /^\/(?:@|%40)([a-z0-9][a-z0-9_]{1,29})$/;

export function middleware(request: NextRequest): NextResponse {
  const match = request.nextUrl.pathname.match(HANDLE_PATH);
  if (match) {
    const url = request.nextUrl.clone();
    url.pathname = `/creators/${match[1]}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  // Only the `/@handle` shape can match; scope the matcher to a leading `@`
  // (raw or percent-encoded) so the middleware never runs for ordinary routes,
  // static assets, or the API surface.
  matcher: ["/@:handle", "/%40:handle"],
};
