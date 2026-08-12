import { afterEach, expect, test, vi } from "vitest";
import { scrubRuntimeRefreshToken } from "./scrub-refresh";

afterEach(() => vi.unstubAllGlobals());

test("scopes the scrub to the captured provider (PRODUCT-1320)", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetch);

  await expect(
    scrubRuntimeRefreshToken(
      "https://runtime.test/auth/scrub-refresh",
      "sbx",
      "openai-codex",
    ),
  ).resolves.toEqual({ ok: true });
  expect(String(fetch.mock.calls[0]?.[0])).toBe(
    "https://runtime.test/auth/scrub-refresh?provider=openai-codex",
  );
});

test("retries failed scrubs and succeeds on the third attempt", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", fetch);

  await expect(
    scrubRuntimeRefreshToken(
      "https://runtime.test/auth/scrub-refresh",
      "sbx",
      "openai-codex",
    ),
  ).resolves.toEqual({ ok: true });
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("returns the final detail after persistent scrub failure", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(
      async () => new Response("still unsafe", { status: 503 }),
    );
  vi.stubGlobal("fetch", fetch);

  await expect(
    scrubRuntimeRefreshToken(
      "https://runtime.test/auth/scrub-refresh",
      "sbx",
      "openai-codex",
    ),
  ).resolves.toEqual({ ok: false, detail: "still unsafe" });
  expect(fetch).toHaveBeenCalledTimes(3);
});
