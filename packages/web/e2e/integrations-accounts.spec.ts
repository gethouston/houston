import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * Multiple accounts per app (HOU-901).
 *
 * A toolkit can hold several connected accounts at once (two Gmail logins).
 * The surfaces render ONE row per app — never two identical Gmail rows — with
 * the account identities on the row's one line; the detail dialog lists each
 * account (removable on its own, confirm-gated) and carries the "Add another
 * account" affordance. Fake host facts: 15 seeded toolkits and one active
 * `gmail` connection; `/__test__/integrations-connection` stamps labels and,
 * with `extraAccount`, stacks a NEW connection on an already-connected app.
 */

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function seedAccount(
  request: APIRequestContext,
  toolkit: string,
  opts: { accountLabel?: string; extraAccount?: boolean } = {},
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/integrations-connection`, {
    data: { toolkit, status: "active", ...opts },
  });
}

async function openIntegrationsPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-integrations"]').click();
}

test("two accounts on one app: one row, named accounts, per-account disconnect", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  // The seeded gmail connection gets its identity; a second account stacks on.
  await seedAccount(request, "gmail", { accountLabel: "dan@gmail.com" });
  await seedAccount(request, "gmail", {
    accountLabel: "work@acme.com",
    extraAccount: true,
  });
  await openIntegrationsPage(page);

  // ONE installed Gmail row, whose line names both accounts.
  const installedGmail = page.getByRole("button", {
    name: /Gmail.*2 accounts/,
  });
  await expect(installedGmail).toHaveCount(1);
  await expect(installedGmail).toContainText("dan@gmail.com");
  await expect(installedGmail).toContainText("work@acme.com");

  // The detail dialog lists each account and the add-account affordance.
  await installedGmail.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("dan@gmail.com")).toBeVisible();
  await expect(dialog.getByText("work@acme.com")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Add another account" }),
  ).toBeVisible();

  // Disconnect ONE account: confirm names the account, the other one stays.
  await dialog
    .getByRole("button", { name: "Disconnect work@acme.com" })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("work@acme.com");
  await confirm.getByRole("button", { name: "Disconnect account" }).click();

  // Back on the strip: still ONE Gmail row, back to its single-account line.
  await expect(page.getByRole("button", { name: /Gmail/ })).toHaveCount(1);
  await expect(page.getByText("2 accounts")).toHaveCount(0);
});

test("a single-account app keeps its plain row and offers adding a second", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio"] });
  await openIntegrationsPage(page);

  const installedGmail = page.getByRole("button", {
    name: /Gmail.*Send and read email/,
  });
  await expect(installedGmail).toHaveCount(1);
  await installedGmail.click();

  // The one account renders with no per-account disconnect (the footer's
  // Disconnect covers a single account), but "Add another account" is right
  // there.
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Add another account" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Disconnect", exact: true }),
  ).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: /^Disconnect ./ }),
  ).toHaveCount(0); // no per-account rows for a single account
});
