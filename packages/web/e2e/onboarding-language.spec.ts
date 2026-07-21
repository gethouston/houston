import {
  FAKE_HOST_URL,
  FAKE_TOKEN,
  SEED_AGENT_ID,
  SEED_WORKSPACE_ID,
} from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

/**
 * First-run LANGUAGE gate (the app's true first screen, before sign-in and the
 * agreement). The default fixture seeds `locale=en` to skip this gate; here we
 * clear it so the picker renders, and assert its contract:
 *
 *   1. the picker is a clean centered white card on the flat first-run
 *      background — NO space photo backdrop,
 *   2. each language is a plain button (one per language, named in its own
 *      language), and
 *   3. clicking any language button ADVANCES IMMEDIATELY — a single click both
 *      persists the choice and moves past the gate. This is the regression
 *      guard for the dead-end where clicking a language did nothing because the
 *      (best-effort) preference write was awaited-then-swallowed before the flow
 *      could advance.
 */
const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";
const pref = (key: string) => `houston.pref.${key}`;
const ACCEPTED_DISCLAIMER = JSON.stringify({
  version: 999999,
  acceptedAt: "2024-01-01T00:00:00.000Z",
});

test("first-run language gate: flat light card, language buttons, and a single click advances", async ({
  page,
}) => {
  // Seed the engine + the later gates, but NOT the locale, so the LanguageGate
  // picker is the first thing shown. (The base fixture pre-seeds locale=en; drop
  // it and the i18next detector cache so the picker actually renders.)
  await page.addInitScript(
    (s: {
      engineKey: string;
      engineVal: string;
      legalKey: string;
      legalVal: string;
      wsKey: string;
      wsVal: string;
      agentKey: string;
      agentVal: string;
    }) => {
      localStorage.setItem(s.engineKey, s.engineVal);
      localStorage.setItem(s.legalKey, s.legalVal);
      localStorage.setItem(s.wsKey, s.wsVal);
      localStorage.setItem(s.agentKey, s.agentVal);
      localStorage.removeItem("houston.pref.locale");
      localStorage.removeItem("i18nextLng");
      (window as unknown as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ = true;
    },
    {
      engineKey: NEW_ENGINE_STORAGE_KEY,
      engineVal: JSON.stringify({ baseUrl: FAKE_HOST_URL, token: FAKE_TOKEN }),
      legalKey: pref("legal_acceptance"),
      legalVal: ACCEPTED_DISCLAIMER,
      wsKey: pref("last_workspace_id"),
      wsVal: SEED_WORKSPACE_ID,
      agentKey: pref("last_agent_id"),
      agentVal: SEED_AGENT_ID,
    },
  );

  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Choose your language" }),
  ).toBeVisible();

  // No space photo backdrop — the first-run flow is a flat light page now.
  expect(await page.locator('img[src*="milkyway"]').count()).toBe(0);

  // Each language is a plain button, named in its own language.
  await expect(page.getByRole("button", { name: "English" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Español" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Português" })).toBeVisible();

  // A single click on a language button advances past the gate immediately.
  await page.getByRole("button", { name: "Español" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your language" }),
  ).toHaveCount(0);
});
