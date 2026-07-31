/**
 * Shared Playwright fixtures.
 *
 * Every test gets a page that is (a) reset to the fake host's seed and (b) primed
 * with the boot seed, so specs start from a known shell with one connected agent.
 *
 * Each parallel WORKER runs its own in-process fake host: `FAKE_HOST_PORT` is
 * worker-slot-aware (see `@houston/fake-host` config.ts), and workers are
 * separate OS processes, so their in-memory host state is isolated for free.
 * That is what lets the suite run fully parallel; within a worker, state is
 * still reset per test.
 */
import {
  FAKE_HOST_PORT,
  type FakeHost,
  startFakeHost,
} from "@houston/fake-host";
import { test as base, expect, type Page } from "@playwright/test";
import { seedPage } from "./seed";

interface Fixtures {
  /** A page pre-seeded with engine config + skipped boot gates. */
  page: Page;
  /** Push a domain reactivity event onto the host's `/v1/events` feed. */
  emitHostEvent: (type: string, agentPath?: string) => Promise<void>;
}

interface WorkerFixtures {
  /** This worker's own fake host. In-worker, `FAKE_HOST_URL` resolves to it. */
  fakeHost: FakeHost;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  fakeHost: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern on a fixture's first parameter
    async ({}, use) => {
      const host = await startFakeHost(FAKE_HOST_PORT);
      await use(host);
      await host.stop();
    },
    { scope: "worker", auto: true },
  ],
  page: async ({ page, request, fakeHost }, use) => {
    // Server-to-server (no CORS): restore the seed before each test.
    await request.post(`${fakeHost.url}/__test__/reset`);
    await seedPage(page);
    await use(page);
  },
  emitHostEvent: async ({ request, fakeHost }, use) => {
    await use(async (type, agentPath) => {
      await request.post(`${fakeHost.url}/__test__/emit`, {
        data: { type, agentPath },
      });
    });
  },
});

export { expect };
