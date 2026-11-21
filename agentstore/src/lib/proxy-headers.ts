export function artifactCors(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: artifactCors() });
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const last = forwarded.split(",").at(-1)?.trim();
    if (last) return last;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
