const SCRUB_ATTEMPTS = 3;
const SCRUB_RETRY_DELAY_MS = 100;

/**
 * `actingAs` scopes the scrub to ONE member's auth file (HOU-976) — the runtime
 * keeps one per acting identity, and an unscoped scrub would clear the shared
 * file while the member's own refresh token stayed on the pod.
 */
export async function scrubRuntimeRefreshToken(
  url: string,
  token: string,
  actingAs?: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  let detail = "";
  for (let attempt = 1; attempt <= SCRUB_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
        },
      });
      if (response.ok) return { ok: true };
      detail = await response.text().catch(() => "");
    } catch (err) {
      detail = err instanceof Error ? err.message : String(err);
    }
    if (attempt < SCRUB_ATTEMPTS)
      await new Promise((resolve) =>
        setTimeout(resolve, SCRUB_RETRY_DELAY_MS * attempt),
      );
  }
  return { ok: false, detail };
}
