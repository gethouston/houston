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
  // integration as a tile alongside the catalog connections.
  await expect(
    page.getByRole("button", { name: "Acme CRM", exact: true }),
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
