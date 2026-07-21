/** Shared HTTP helpers for the fake host: permissive CORS + JSON responses. */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization,Content-Type,Accept,X-Houston-App-Version",
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
