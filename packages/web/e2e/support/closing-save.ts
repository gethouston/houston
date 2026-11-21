import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { seedPage } from "./seed";

export async function holdClosingSave(
  request: APIRequestContext,
): Promise<() => Promise<void>> {
  await request.post(`${FAKE_HOST_URL}/__test__/hold-imports`, {
    data: { hold: true },
  });
  return async () => {
    await request.post(`${FAKE_HOST_URL}/__test__/hold-imports`, {
      data: { hold: false },
    });
  };
}

export async function evictMidClosing(page: Page): Promise<Page> {
  const url = page.url();
  const reducedMotion = await page.evaluate(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const fresh = await page.context().newPage();
  if (reducedMotion) await fresh.emulateMedia({ reducedMotion: "reduce" });
  await seedPage(fresh);
  await page.close();
  await fresh.goto(url);
  return fresh;
}
