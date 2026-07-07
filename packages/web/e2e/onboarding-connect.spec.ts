import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * First-run onboarding's "Connect your AI" step, end to end against the fake
 * host. This is the regression guard for HOU-onboarding-connect: the step used
 * to map the RAW override-only seed (11 providers, OAuth-only), so every
 * API-key provider dead-ended. It now embeds the shared `<ProviderPicker>`, so
 * it must (a) show this deployment's FULL `/v1/catalog` provider set (well
 * beyond the 11-entry seed) and (b) open the paste-a-key dialog for an API-key
 * provider instead of an OAuth wait screen.
 *
 * (a) also guards the picker's IN-COMPONENT catalog reactivity: `ProviderPicker`
 * itself now depends on `useProviderCatalog().updatedAt` (no external `key=`
 * remount), so a card count past the 11-entry seed proves the async
 * `/v1/catalog` hydration reaches the picker's memo after mount.
 *
 * Not covered here: the re-entry strand fix (a connected local
 * OpenAI-compatible provider resolving its model via `active_model` so the step
 * auto-advances instead of stranding). The fake host 404s the onboarding
 * picker's status route (`/setup-runtime/providers`), so NO provider ever
 * reports connected in this harness and there is no control to seed a custom
 * endpoint's `active_model` — the scenario can't be simulated without a
 * fake-host change out of this task's scope.
 *
 * Reaching first-run: onboarding shows when the v3 host reports ZERO agents, so
 * we delete the seeded agent over the API before boot (no fake-host change).
 */
test("onboarding connect step shows the full catalog and opens the API-key dialog", async ({
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

  // Intro → the connect step.
  await page.getByRole("button", { name: "Start setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Connect your AI" }),
  ).toBeVisible();

  // (a) The picker renders the hydrated catalog, not the override-only seed.
  // Every card is unconnected in the harness (no credentials), so each is a
  // "Connect {name}" button. The seed is 11 providers; the local catalog is
  // ~30+, so a count past the seed proves `/v1/catalog` hydration reached the
  // onboarding surface.
  const connectCards = page.getByTitle(/^Connect /);
  await expect(connectCards.first()).toBeVisible();
  expect(await connectCards.count()).toBeGreaterThan(11);
  // Names only the hydrated catalog carries (absent from the OAuth-only seed
  // path the old screen showed).
  await expect(page.getByTitle("Connect OpenRouter")).toBeVisible();
  await expect(page.getByTitle("Connect Google Gemini")).toBeVisible();

  // (b) An API-key provider opens the paste-a-key dialog, NOT an OAuth wait
  // screen. OpenRouter connects with a pasted key (`auth: "apiKey"`).
  await page.getByTitle("Connect OpenRouter").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Paste your OpenRouter API key/)).toBeVisible();
  await expect(dialog.getByPlaceholder("Paste your API key")).toBeVisible();
});
