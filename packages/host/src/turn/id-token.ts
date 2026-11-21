const METADATA_IDENTITY_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";

function tokenExpiryMs(jwt: string): number {
  try {
    const payload = jwt.split(".")[1] ?? "";
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as {
      exp?: number;
    };
    return typeof claims.exp === "number" ? claims.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function makeIdTokenProvider(
  audience: string,
): () => Promise<string | null> {
  let cached: { token: string; expiresMs: number } | null = null;

  return async () => {
    if (cached && Date.now() < cached.expiresMs - 5 * 60_000)
      return cached.token;
    let res: Response;
    try {
      res = await fetch(
        `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}&format=full`,
        {
          headers: { "Metadata-Flavor": "Google" },
          signal: AbortSignal.timeout(1500),
        },
      );
    } catch {
      return null;
    }
    if (!res.ok) {
      throw new Error(
        `metadata server refused an ID token (${res.status}): ${await res.text().catch(() => "")}`,
      );
    }
    const token = (await res.text()).trim();
    cached = { token, expiresMs: tokenExpiryMs(token) };
    return token;
  };
}
