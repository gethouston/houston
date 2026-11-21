import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import { openNavRow } from "./support/workspace-menu";

interface OpenLedger {
  calls: string[];
  navigations: string[];
  blocked: boolean;
}

function ledgerOf(page: Page): Promise<OpenLedger> {
  return page.evaluate(
    () => (window as unknown as { __openLedger: OpenLedger }).__openLedger,
  );
}

async function stubWindowOpen(page: Page, blocked: boolean): Promise<void> {
  await page.addInitScript((initiallyBlocked: boolean) => {
    const ledger: OpenLedger = {
      calls: [],
      navigations: [],
      blocked: initiallyBlocked,
    };
    (window as unknown as { __openLedger: OpenLedger }).__openLedger = ledger;
    window.open = ((url?: string | URL) => {
      ledger.calls.push(String(url ?? ""));
      if (ledger.blocked) return null;
      const tab = {
        closed: false,
        opener: window,
        location: {
          set href(value: string) {
            ledger.navigations.push(value);
          },
        },
        close: () => {
          tab.closed = true;
        },
      };
      return tab as unknown as Window;
    }) as typeof window.open;
  }, blocked);
}

async function armComposio(request: APIRequestContext): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { integrations: ["composio"] },
  });
}

async function openIntegrationsPage(page: Page): Promise<void> {
  await page.goto("/");
  await openNavRow(page, "integrations");
}

test("the OAuth tab is claimed inside the click and pointed at the minted link", async ({
  page,
  request,
}) => {
  await armComposio(request);
  await stubWindowOpen(page, false);
  await openIntegrationsPage(page);

  await page.getByRole("button", { name: "Connect Slack" }).first().click();
  await expect(page.getByText("Finish connecting Slack")).toBeVisible();

  await expect
    .poll(async () => (await ledgerOf(page)).navigations)
    .toEqual(["https://connect.test/slack"]);
  expect((await ledgerOf(page)).calls).toEqual([""]);
});

test("a refused tab is said out loud, and the row's own click opens it", async ({
  page,
  request,
}) => {
  await armComposio(request);
  await stubWindowOpen(page, true);
  await openIntegrationsPage(page);

  await page.getByRole("button", { name: "Connect Slack" }).first().click();

  const panel = page
    .getByRole("status")
    .filter({ hasText: "Your browser blocked the Slack tab" });
  await expect(panel).toBeVisible();
  await expect(page.getByText("We opened Slack in your browser")).toHaveCount(
    0,
  );
  expect((await ledgerOf(page)).calls).toEqual([
    "",
    "https://connect.test/slack",
  ]);

  await page.evaluate(() => {
    (window as unknown as { __openLedger: OpenLedger }).__openLedger.blocked =
      false;
  });
  await panel.getByRole("button", { name: "Open Slack" }).click();
  await expect
    .poll(async () => (await ledgerOf(page)).calls.at(-1))
    .toBe("https://connect.test/slack");

  const waiting = page
    .getByRole("status")
    .filter({ hasText: "Finish connecting Slack" });
  await expect(waiting).toBeVisible();
  await expect(
    page.getByText("Your browser blocked the Slack tab"),
  ).toHaveCount(0);
  await expect(
    waiting.getByRole("button", { name: "Reopen in browser" }),
  ).toBeVisible();
  await expect(
    waiting.getByRole("button", { name: "I have finished" }),
  ).toBeVisible();
});
