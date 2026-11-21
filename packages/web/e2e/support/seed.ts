import {
  FAKE_HOST_URL,
  FAKE_TOKEN,
  SEED_AGENT_ID,
  SEED_WORKSPACE_ID,
} from "@houston/fake-host";
import type { Page } from "@playwright/test";

const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";
const pref = (key: string) => `houston.pref.${key}`;

interface Seed {
  storage: Record<string, string>;
}

function buildSeed(overrides?: { agentId?: string }): Seed {
  const agentId = overrides?.agentId ?? SEED_AGENT_ID;
  return {
    storage: {
      [NEW_ENGINE_STORAGE_KEY]: JSON.stringify({
        baseUrl: FAKE_HOST_URL,
        token: FAKE_TOKEN,
      }),
      [pref("locale")]: "en",
      [pref("last_workspace_id")]: SEED_WORKSPACE_ID,
      [pref("last_agent_id")]: agentId,
      i18nextLng: "en",
    },
  };
}

export async function seedPage(
  page: Page,
  overrides?: { agentId?: string },
): Promise<void> {
  await page.addInitScript((seed: Seed) => {
    try {
      for (const [k, v] of Object.entries(seed.storage))
        localStorage.setItem(k, v);
    } catch {}
    (window as unknown as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ = true;
  }, buildSeed(overrides));
}
