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
 * custom integration surfaces in the consolidated Installed strip + its own
 * tab, and that the pending → enter-key flow works.
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

  // The consolidated Installed strip (OUTSIDE the tabs) carries the custom
  // integration as a tile (name + its API/MCP badge) alongside the catalog
  // connections.
  await expect(
    page.getByRole("button", { name: "Acme CRM API" }),
  ).toBeVisible();

  // Its row (status + actions) lives in the Custom integrations tab.
  await page.getByRole("tab", { name: "Custom integrations" }).click();
  await expect(page.getByText("Needs an API key")).toBeVisible();

  // Enter the key: the secure dialog collects it, the definition flips active.
  await page.getByRole("button", { name: "Enter key" }).click();
  await page.getByLabel("API key (X-Api-Key)").fill("sk_test_42");
  await page.getByRole("button", { name: "Save key" }).click();

  // The reactivity event refreshes the list: pending state gone, tool count in.
  await expect(page.getByText("Needs an API key")).not.toBeVisible();
  await expect(page.getByText("3 actions")).toBeVisible();
});

test("the manual add form detects a URL, registers the integration, and it lands in the list (HOU-980)", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, []);
  await openIntegrationsPage(page);

  // Empty custom tab collapses to the pure empty state; its CTA opens the
  // add fork, whose second path is the manual typed form.
  await page.getByRole("tab", { name: "Custom integrations" }).click();
  await page.getByRole("button", { name: "Add custom integration" }).click();
  await page.getByRole("button", { name: /Add it manually/ }).click();

  // Check pre-classifies the URL and fills the name the user has not typed.
  await page
    .getByLabel("API documentation URL")
    .fill("https://api.acme.test/openapi.json");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("Recognized an API service.")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Acme API");

  // Register: the dialog closes and the reactivity event lands the new row.
  await page.getByRole("button", { name: "Add integration" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("3 actions")).toBeVisible();
});

test("adding manually with a key lands pending and chains straight into the secure key dialog", async ({
  page,
  request,
}) => {
  await armCapabilities(request, { integrations: ["composio", "custom"] });
  await armIntegrationsMode(request, "ready");
  await armCustomIntegrations(request, []);
  await openIntegrationsPage(page);

  await page.getByRole("tab", { name: "Custom integrations" }).click();
  await page.getByRole("button", { name: "Add custom integration" }).click();
  await page.getByRole("button", { name: /Add it manually/ }).click();

  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("button", { name: "MCP server" }).click();
  await addDialog.getByLabel("MCP server URL").fill("https://mcp.acme.test");
  await addDialog.getByLabel("Name").fill("Acme MCP");
  await addDialog.getByRole("switch").click();
  await addDialog.getByRole("button", { name: "Add integration" }).click();

  // The pending definition immediately asks for its key (the secure dialog),
  // and saving it activates the integration. Await the key dialog's title
  // first, then scope the fill to the OPEN dialog: the add dialog's exit
  // animation keeps it mounted briefly, and its "Needs an API key" switch
  // label would otherwise be a rival substring match for getByLabel.
  await expect(page.getByText("Enter the key for Acme MCP")).toBeVisible();
  await page.getByRole("dialog").getByLabel("API key").fill("sk_test_42");
  await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("3 actions")).toBeVisible();
});

test("an Installed-strip custom tile opens the detail card: metadata, actions list, and remove (HOU-980)", async ({
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
      tools: [
        { name: "create_contact", description: "Create a contact" },
        { name: "list_deals" },
      ],
    },
  ]);
  await openIntegrationsPage(page);

  // The strip tile now opens the detail card in place (no tab jump).
  await page.getByRole("button", { name: "Acme Live API" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Acme Live")).toBeVisible();
  // Exact: the description line ("Connected and working. ...") is a rival
  // substring match for the status chip's bare "Connected".
  await expect(dialog.getByText("Connected", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("https://api.acme.test/openapi.json"),
  ).toBeVisible();
  await expect(dialog.getByText("create_contact")).toBeVisible();
  await expect(dialog.getByText("list_deals")).toBeVisible();

  // Remove chains into the named confirm, and the tile disappears.
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Remove Acme Live?")).toBeVisible();
  await page
    .getByRole("dialog")
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
