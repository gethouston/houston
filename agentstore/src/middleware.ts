import { type NextRequest, NextResponse } from "next/server";

const HANDLE_PATH = /^\/(?:@|%40)([a-z0-9][a-z0-9_]{1,29})$/;

const PAGE_METHODS = "GET, HEAD";
const API_METHODS = "GET, HEAD, OPTIONS";

function allowedMethods(pathname: string): string {
  return pathname === "/api" || pathname.startsWith("/api/")
    ? API_METHODS
    : PAGE_METHODS;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const allow = allowedMethods(pathname);
  if (!allow.split(", ").includes(request.method)) {
    return new NextResponse(null, { status: 405, headers: { allow } });
  }
  const match = pathname.match(HANDLE_PATH);
  if (match) {
    const url = request.nextUrl.clone();
    url.pathname = `/creators/${match[1]}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static/).*)"],
};
