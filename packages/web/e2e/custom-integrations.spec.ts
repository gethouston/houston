import { FAKE_HOST_URL } from "@houston/fake-host";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";

/**
 * Custom integrations (HOU-550) on the global Integrations page.
 *
 * The load-bearing case is the COMPOSIO-ABSENT install (no key, no gateway —
 * the default self-host/dev shape): the readiness list carries only the
 * key-free `custom` provider, and the page must render the Custom
 * integrations section instead of going dark with "not available in this
 * setup" (the regression this spec pins). The ready-mode case checks the
 * custom integration surfaces behind the page-level Custom integrations mode
 * (its own Installed list — never mixed into the Composio strip since the
 * mode split), and that the pending → enter-key flow works.
 */

async function armCapabilities(
  request: APIRequestContext,
  caps: Record<string, unknown>,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, { data: caps });
}

async function armIntegrationsMode(
  request: APIRequestContext,
  mode: "ready" | "unavailable" | "signin" | "absent",
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/integrations-mode`, {
    data: { mode },
  });
}

async function armCustomIntegrations(
  request: APIRequestContext,
  items: unknown[] | null,
): Promise<void> {
  await request.post(`${FAKE_HOST_URL}/__test__/custom-integrations`, {
    data: { items },
  });
}

async function openIntegrationsPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.locator('[data-tour-target="nav-integrations"]').click();
}

const ACME_PENDING = {
  slug: "acme_crm",
  name: "Acme CRM",
  kind: "openapi",
  displayUrl: "https://api.acme.test/openapi.json",
  addedAtMs: 0,
  state: {
    status: "pending",
    authMethods: [
      {
        template: "apikey-0",
        label: "API key (X-Api-Key)",
        fields: [{ variable: "token", label: "API key (X-Api-Key)" }],
      },
    ],
  },
  authMethods: [
    {
      template: "apikey-0",
      label: "API key (X-Api-Key)",
      fields: [{ variable: "token", label: "API key (X-Api-Key)" }],
    },
  ],
};

test("a composio-absent host still renders the Custom integrations section", async ({
  page,
  request,
}) => {
  // The self-host/dev shape: no Composio at all, only the custom provider.
  await armCapabilities(request, { integrations: ["custom"] });
  await armIntegrationsMode(request, "absent");
  await armCustomIntegrations(request, []);
  await openIntegrationsPage(page);

  // The custom section is alive: heading, add button, and the empty state.
  await expect(
    page.getByRole("heading", { name: "Custom integrations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add custom integration" }),
  ).toBeVisible();

  // The catalog's absence is scoped to the catalog — never a page blackout.
  await expect(
    page.getByText("The app catalog isn't available in this setup", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Integrations are not available in this setup"),
  ).not.toBeVisible();
});

test("ready mode lists a pending custom integration and the enter-key flow activates it", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, [ACME_PENDING]);
  await openIntegrationsPage(page);

  // The Custom integrations mode carries the row (name + its API/MCP badge
  // + status) in ITS Installed section — the Composio strip never mixes
  // custom rows in (the mode split shows one source at a time).
  await page.getByRole("tab", { name: "Custom integrations" }).click();
  await expect(
    page.getByRole("button", { name: "Acme CRM API" }),
  ).toBeVisible();
  await expect(page.getByText("Needs an API key")).toBeVisible();

  // Enter the key: the secure dialog collects it, the definition flips active.
  await page.getByRole("button", { name: "Enter key" }).click();
  await page.getByLabel("API key (X-Api-Key)").fill("sk_test_42");
  await page.getByRole("button", { name: "Save key" }).click();

  // The reactivity event refreshes the list: pending state gone, the row now
  // reads Connected — the action COUNT is deliberately absent from rows
  // (discovery isn't deterministic enough yet for a number to be a promise;
  // the detail card still carries it).
  await expect(page.getByText("Needs an API key")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Acme CRM API" }).getByText("Connected"),
  ).toBeVisible();
});

test("a custom row opens the detail card: metadata, action count, and remove (HOU-980)", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, [
    {
      ...ACME_PENDING,
      slug: "acme_live",
      name: "Acme Live",
      state: { status: "active", toolCount: 2 },
    },
  ]);
  await openIntegrationsPage(page);

  // The row's body is the open affordance for the detail card.
  await page.getByRole("tab", { name: "Custom integrations" }).click();
  await page.getByRole("button", { name: "Acme Live API" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Acme Live")).toBeVisible();
  // Exact: the description line ("Connected and working. ...") is a rival
  // substring match for the status chip's bare "Connected".
  await expect(dialog.getByText("Connected", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("https://api.acme.test/openapi.json"),
  ).toBeVisible();
  // The action COUNT is the whole story (the per-action list was cut on
  // review — raw tool names read as noise to a non-technical audience).
  await expect(dialog.getByText("2 actions")).toBeVisible();

  // Remove chains into the named confirm (an ALERTDIALOG — ConfirmDialog
  // rides Radix AlertDialog, which getByRole("dialog") never matches), and
  // the tile disappears.
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Remove Acme Live?")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(
    page.getByRole("button", { name: "Acme Live API" }),
  ).not.toBeVisible();
});

test("a pending integration's detail card leads with Enter key and opens the secure dialog", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, [ACME_PENDING]);
  await openIntegrationsPage(page);

  await page.getByRole("tab", { name: "Custom integrations" }).click();
  await page.getByRole("button", { name: "Acme CRM API" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Waiting for an API key", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Enter key" }).click();

  // The detail card hands off to the secure key dialog for THIS integration.
  await expect(
    page.getByRole("dialog").getByText("Enter the key for Acme CRM"),
  ).toBeVisible();
});
