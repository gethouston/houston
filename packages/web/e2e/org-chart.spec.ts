import { FAKE_HOST_URL, SEED_AGENT_ID } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";
import { AUTH_WEB_URL, signInAsViewer } from "./support/identity";
import { openAdminSection } from "./support/settings-nav";
import { seedSidebarLayout } from "./support/sidebar-layout";

test.use({ baseURL: AUTH_WEB_URL });

test("the org chart shows one neutral card for ungrouped agents", async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
    data: { multiplayer: true, teams: true, role: "owner" },
  });
  await seedSidebarLayout(request, {
    groups: [],
    order: [{ kind: "agent", id: SEED_AGENT_ID }],
  });
  await signInAsViewer(page);
  await openAdminSection(page, "Org chart");
  const chart = page.locator("[data-admin-section-body='orgChart']");
  await expect(chart.getByText("No group")).toBeVisible();
  await expect(chart.getByText("Houston")).toBeVisible();
  await expect(chart.getByText("People")).toHaveCount(0);
});
