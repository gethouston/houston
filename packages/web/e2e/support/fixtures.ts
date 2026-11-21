import {
  FAKE_HOST_PORT,
  type FakeHost,
  SEED_AGENT_ID,
  startFakeHost,
} from "@houston/fake-host";
import { test as base, expect, type Page } from "@playwright/test";
import { seedPage } from "./seed";
import { seedSidebarLayout } from "./sidebar-layout";

interface Fixtures {
  teamBoard: boolean;
  page: Page;
  emitHostEvent: (type: string, agentPath?: string) => Promise<void>;
}

interface WorkerFixtures {
  fakeHost: FakeHost;
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  teamBoard: [false, { option: true }],
  fakeHost: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright requires the destructuring pattern on a fixture's first parameter
    async ({}, use) => {
      const host = await startFakeHost(FAKE_HOST_PORT);
      await use(host);
      await host.stop();
    },
    { scope: "worker", auto: true },
  ],
  page: async ({ page, request, fakeHost, teamBoard }, use) => {
    await request.post(`${fakeHost.url}/__test__/reset`);
    if (teamBoard) {
      await seedSidebarLayout(request, {
        groups: [
          {
            id: "team-board",
            name: "Team",
            collapsed: false,
            agentIds: [SEED_AGENT_ID],
          },
        ],
        order: [],
      });
    }
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
