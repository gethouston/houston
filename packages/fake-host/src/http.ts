export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers":
    "Range,X-HTTP-Status-Code-Override,Retry-After",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization,Content-Type,Accept,X-Houston-App-Version,X-Houston-Org,Content-Range,X-GUploader-No-308",
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

export async function parseBody(
  req: Request,
): Promise<Record<string, unknown> | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (req.headers.get("content-type")?.includes("application/zip"))
    return undefined;
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
