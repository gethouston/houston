import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * First-run onboarding's "Connect your AI" step, end to end against the fake
 * host, in the CURATED mode onboarding now passes to the shared
 * `<ProviderBrowser>`. Curated mode shows only the FEATURED providers, split into
 * "Subscription" / "API key" Sections, with a "See all providers" chip; the full
 * `/v1/catalog` set (~35 providers, well beyond the 11-entry seed) stays behind
 * that chip until the user searches, filters, or expands.
 *
 * This is the regression guard for two coupled defects:
 *   1. curated search narrowed to the featured set AFTER filtering, so searching
 *      a NON-featured provider (e.g. DeepSeek) produced a non-empty `filtered`
 *      yet rendered nothing but a dangling "See all providers" chip. Searching /
 *      quick-filtering now bypasses the featured narrowing and surfaces the match
 *      (and hides the now-meaningless chip).
 *   2. onboarding regressed the connect step to curated-only; this spec asserts
 *      the intended curated behavior end to end — default featured view, search,
 *      expand-to-full-catalog, and the API-key paste dialog.
 *
 * Expanding to the full catalog also guards the surface's catalog reactivity:
 * `useProviderBrowserData` re-keys its connect-list memo on
 * `useProviderCatalog().updatedAt` (no external `key=` remount), so a card count
 * past the 11-entry seed proves the async `/v1/catalog` hydration reaches the
 * memo after mount.
 *
 * Selector strategy: every provider is unconnected in the harness (the fake
 * host's `/setup-runtime/providers` serves the EMPTY first-run slot), so each
 * renders a Connect pill whose accessible name is `Connect {name}` (an
 * aria-label the row sets so each pill reads distinctly). We select by
 * role+name. The search box is selected by its placeholder; the Sections by
 * their translated header text.
 *
 * Not covered here: the re-entry strand fix (a connected local OpenAI-compatible
 * provider resolving its model via `active_model` so the step auto-advances
 * instead of stranding). The fake host's setup slot seeds unconnected and there
 * is no control to seed a custom endpoint's `active_model` — the scenario can't
 * be simulated without a fake-host change out of this task's scope.
 *
 * Reaching first-run: onboarding shows when the v3 host reports ZERO agents, so
 * we delete the seeded agent over the API before boot (no fake-host change).
 */
test("onboarding connect step shows the curated view, searches, expands, and opens the API-key dialog", async ({
  page,
  request,
}) => {
  // Empty the host's agents so App's first-run gate opens the onboarding
  // orchestrator (v3 first-run = zero agents).
  const agents = (await (
    await request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as {
    id: string;
  }[];
  for (const agent of agents) {
    await request.delete(`${FAKE_HOST_URL}/agents/${agent.id}`);
  }

  await page.goto("/");

  // First-run asks the work-segmentation question before the
  // create-your-assistant flow. The selection is required, so make one
  // explicit choice before exercising the connect step.
  await page.getByRole("button", { name: /Operations/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Onboarding opens directly on the connect step (the welcome/intro screen
  // was removed).
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toBeVisible();

  const connectPills = page.getByRole("button", { name: /^Connect / });
  const seeAll = page.getByRole("button", { name: "See all providers" });
  const deepseekPill = page.getByRole("button", { name: "Connect DeepSeek" });

  // (1) DEFAULT CURATED VIEW: the featured providers render grouped under the
  // "Subscription" and "API key" section headers (Anthropic is subscription,
  // Google Gemini is an API key), the rest of the catalog is collapsed behind
  // "See all providers", and a NON-featured provider (DeepSeek) is NOT visible.
  await expect(
    page.getByRole("button", { name: "Connect Anthropic" }),
  ).toBeVisible();
  await expect(page.getByText("Subscription", { exact: true })).toBeVisible();
  await expect(page.getByText("API key", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Google Gemini" }),
  ).toBeVisible();
  await expect(seeAll).toBeVisible();
  await expect(deepseekPill).toHaveCount(0);

  // (2) SEARCH surfaces a NON-featured provider (Fix 1): typing "deepseek" shows
  // its card even though it is not featured, and hides the now-meaningless "See
  // all providers" chip. Clearing the search returns to the featured set.
  const search = page.getByPlaceholder("Search providers");
  await search.fill("deepseek");
  await expect(deepseekPill).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Anthropic" }),
  ).toHaveCount(0);
  await expect(seeAll).toHaveCount(0);

  await search.fill("");
  await expect(deepseekPill).toHaveCount(0);
  await expect(seeAll).toBeVisible();

  // (3) "See all providers" EXPANDS to the full catalog: the seed is 11
  // providers, the hydrated catalog is ~35, so a count past the seed proves
  // `/v1/catalog` reached the surface. Non-featured names (DeepSeek, OpenRouter)
  // are now present and the chip is gone.
  await seeAll.click();
  await expect(connectPills.first()).toBeVisible();
  expect(await connectPills.count()).toBeGreaterThan(11);
  await expect(deepseekPill).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect OpenRouter" }),
  ).toBeVisible();
  await expect(seeAll).toHaveCount(0);

  // (4) An API-key provider opens the paste-a-key dialog, NOT an OAuth wait
  // screen. OpenRouter connects with a pasted key (`auth: "apiKey"`).
  await page.getByRole("button", { name: "Connect OpenRouter" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Paste your OpenRouter API key/)).toBeVisible();
  await expect(dialog.getByPlaceholder("Paste your API key")).toBeVisible();
});
