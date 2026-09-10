import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "./support/fixtures";

for (const width of [1280, 390]) {
  test(`custom name and website can be edited without reconnecting at ${width}px`, async ({
    page,
    request,
  }) => {
    await request.post(`${FAKE_HOST_URL}/__test__/capabilities`, {
      data: { integrations: ["custom"] },
    });
    await request.post(`${FAKE_HOST_URL}/__test__/integrations-mode`, {
      data: { mode: "absent" },
    });
    const integration = {
      slug: "original-id",
      name: "Supabase MCP",
      kind: "mcp",
      auth: "oauth",
      addedAtMs: 0,
      displayUrl: "https://project.supabase.co/functions/v1/mcp",
      state: { status: "active", toolCount: 2 },
    };
    await request.post(`${FAKE_HOST_URL}/__test__/custom-integrations`, {
      data: { items: [integration] },
    });
    let saved = false;
    await page.route(
      "**/integrations/custom/definitions/original-id",
      async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        const details = route.request().postDataJSON();
        expect(details).toEqual({
          name: "Spark",
          website: "https://spark.studioroda.co",
        });
        await request.post(`${FAKE_HOST_URL}/__test__/custom-integrations`, {
          data: {
            items: [
              {
                ...integration,
                ...details,
                iconUrl: "https://spark.studioroda.co/favicon.ico",
              },
            ],
          },
        });
        saved = true;
        await route.fulfill({ json: { ok: true } });
      },
    );
    // Keep the rendering test independent of the external site's availability.
    await page.route("https://spark.studioroda.co/favicon.ico", (route) =>
      route.abort(),
    );
    await page.goto("/");
    await page.locator('[data-tour-target="nav-integrations"]').click();
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Supabase MCP MCP server" }).click();
    await page
      .getByRole("button", { name: "Edit details", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("Spark");
    await dialog
      .getByLabel("Website (optional)", { exact: true })
      .fill("https://spark.studioroda.co");
    await expect(
      dialog.getByText(
        "Change how this integration appears. Your connection stays the same.",
      ),
    ).toBeVisible();
    await page.screenshot({ path: `/tmp/houston-spark-edit-${width}.png` });
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toHaveCount(0);
    expect(saved).toBe(true);
    const row = page.getByRole("button", { name: "Spark MCP server" });
    await expect(row).toBeVisible();
    await row.click();
    await expect(
      page.getByRole("dialog").getByText("Connected", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText(integration.displayUrl),
    ).toBeVisible();
  });
}
