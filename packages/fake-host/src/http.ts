/** Shared HTTP helpers for the fake host: permissive CORS + JSON responses. */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  // Must cover every header the adapter's gatewayAuthFetch attaches — a
  // missing one preflight-fails EVERY request the moment it appears (the
  // active-space pin x-houston-org only rides after a team switch, which is
  // exactly how prod broke in HOU-825's incident with x-houston-app-version).
  "Access-Control-Allow-Headers":
    "Authorization,Content-Type,Accept,X-Houston-App-Version,X-Houston-Org",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function noContent(status = 204): Response {
  return new Response(null, { status, headers: CORS });
}
