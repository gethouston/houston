const SCRUB_ATTEMPTS = 3;
const SCRUB_RETRY_DELAY_MS = 100;

export async function scrubRuntimeRefreshToken(
  url: string,
  token: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  let detail = "";
  for (let attempt = 1; attempt <= SCRUB_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
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
