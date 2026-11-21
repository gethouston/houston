import {
  FAKE_HOST_URL,
  FAKE_TOKEN,
  SEED_AGENT_ID,
  SEED_WORKSPACE_ID,
} from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";
const pref = (key: string) => `houston.pref.${key}`;

test("first-run language gate: flat light card, language buttons, and a single click advances", async ({
  page,
}) => {
  await page.addInitScript(
    (s: {
      engineKey: string;
      engineVal: string;
      wsKey: string;
      wsVal: string;
      agentKey: string;
      agentVal: string;
    }) => {
      localStorage.setItem(s.engineKey, s.engineVal);
      localStorage.setItem(s.wsKey, s.wsVal);
      localStorage.setItem(s.agentKey, s.agentVal);
      localStorage.removeItem("houston.pref.locale");
      localStorage.removeItem("i18nextLng");
      (window as unknown as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ = true;
    },
    {
      engineKey: NEW_ENGINE_STORAGE_KEY,
      engineVal: JSON.stringify({ baseUrl: FAKE_HOST_URL, token: FAKE_TOKEN }),
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

  expect(await page.locator('img[src*="milkyway"]').count()).toBe(0);

  await expect(page.getByRole("button", { name: "English" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Español" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Português" })).toBeVisible();

  await page.getByRole("button", { name: "Español" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your language" }),
  ).toHaveCount(0);
});
