/**
 * Shared Playwright fixtures.
 *
 * Every test gets a page that is (a) reset to the fake host's seed and (b) primed
 * with the boot seed, so specs start from a known shell with one connected agent.
 * The fake host is a single shared process, so the suite runs with `workers: 1`
 * and resets state per test for isolation (see playwright.config.ts).
 */
import { test as base, expect, type Page } from "@playwright/test";
import { FAKE_HOST_URL } from "../fake-host/ports";
import { seedPage } from "./seed";

interface Fixtures {
  /** A page pre-seeded with engine config + skipped boot gates. */
  page: Page;
  /** Push a domain reactivity event onto the host's `/v1/events` feed. */
  emitHostEvent: (type: string, agentPath?: string) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  page: async ({ page, request }, use) => {
    // Server-to-server (no CORS): restore the seed before each test.
    await request.post(`${FAKE_HOST_URL}/__test__/reset`);
    await seedPage(page);
    await use(page);
  },
  emitHostEvent: async ({ request }, use) => {
    await use(async (type, agentPath) => {
      await request.post(`${FAKE_HOST_URL}/__test__/emit`, {
        data: { type, agentPath },
      });
    });
  },
});

export { expect };
