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
 * clear it so the picker renders, and assert the connect-first flow's contract:
 *
 *   1. the picker floats on the shared SpaceScreen starfield (same backdrop as
 *      sign-in and the rest of onboarding — the WebGL nebula + starfield paint
 *      two <canvas> layers behind the card), and
 *   2. picking a language ADVANCES IMMEDIATELY — there is no Continue button, so
 *      a single click both persists the choice and moves past the gate. This is
 *      the regression guard for the dead-end where clicking a language did
 *      nothing because the (best-effort) preference write was awaited-then-
 *      swallowed before the flow could advance.
 */
const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";
const pref = (key: string) => `houston.pref.${key}`;
const ACCEPTED_DISCLAIMER = JSON.stringify({
  version: 999999,
  acceptedAt: "2024-01-01T00:00:00.000Z",
});

test("first-run language gate: starfield backdrop, and a single click advances (no Continue)", async ({
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

  // The shared space backdrop paints behind the card (nebula + starfield canvases).
  expect(await page.locator("canvas").count()).toBeGreaterThan(0);

  // No Continue button — the row itself is the action.
  await expect(
    page.getByRole("button", { name: /Continue|Continuar/ }),
  ).toHaveCount(0);

  // A single click on a language advances past the gate.
  await page.getByText("Español", { exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your language" }),
  ).toHaveCount(0);
});
