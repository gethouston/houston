/**
 * Boot seed for the UI tests.
 *
 * A browser tab has no Tauri supervisor and no Connect screen interaction, so we
 * prime `localStorage` + `window.__HOUSTON_CP__` BEFORE any app script runs
 * (Playwright `addInitScript` runs before page scripts on every navigation).
 * That makes the app:
 *   - skip the engine Connect screen (engine config is already stored),
 *   - run the adapter in host mode (`__HOUSTON_CP__`), matching the
 *     real cloud/desktop-host deployment,
 *   - skip the first-run language picker (locale pref set to `en` → stable,
 *     English text in assertions), and
 *   - skip the legal disclaimer (a version far above CURRENT_DISCLAIMER_VERSION,
 *     so this never silently breaks when the disclaimer is bumped).
 *
 * The keys mirror the adapter's localStorage layout
 * (packages/web/src/engine-adapter/client.ts `getPreference` → `houston.pref.*`,
 * packages/web/src/engine-config.ts `NEW_ENGINE_STORAGE_KEY`).
 */
import type { Page } from "@playwright/test";
import {
  FAKE_HOST_URL,
  FAKE_TOKEN,
  SEED_AGENT_ID,
  SEED_WORKSPACE_ID,
} from "../fake-host/ports";

const NEW_ENGINE_STORAGE_KEY = "houston.web.engine.new";
const pref = (key: string) => `houston.pref.${key}`;

/** Far above CURRENT_DISCLAIMER_VERSION (=2) so acceptance always passes — even
 *  after a future disclaimer bump — without coupling the test to the constant. */
const ACCEPTED_DISCLAIMER = {
  version: 999999,
  acceptedAt: "2024-01-01T00:00:00.000Z",
};

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
      [pref("legal_acceptance")]: JSON.stringify(ACCEPTED_DISCLAIMER),
      [pref("last_workspace_id")]: SEED_WORKSPACE_ID,
      [pref("last_agent_id")]: agentId,
      // i18next's own language-detector cache — pin it so the very first paint is
      // English instead of the browser's locale.
      i18nextLng: "en",
    },
  };
}

/** Install the boot seed on a page (call once, before `goto`). */
export async function seedPage(
  page: Page,
  overrides?: { agentId?: string },
): Promise<void> {
  await page.addInitScript((seed: Seed) => {
    try {
      for (const [k, v] of Object.entries(seed.storage))
        localStorage.setItem(k, v);
    } catch {
      /* storage disabled — the app would fail anyway; let the assertion report it */
    }
    (window as unknown as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__ = true;
  }, buildSeed(overrides));
}
