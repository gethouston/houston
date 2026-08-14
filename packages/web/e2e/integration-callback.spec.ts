import { expect, test } from "@playwright/test";

test("the integration callback paints only the localized completion page and closes its tab", async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "language", { get: () => "es-CO" });
    window.close = () => {
      document.documentElement.dataset.closeRequested = "true";
    };
  });

  await page.goto("/connected/");

  await expect(
    page.getByRole("heading", { name: "Conexión completada" }),
  ).toBeVisible();
  await expect(
    page.getByText("Puedes cerrar esta pestaña y volver a Houston."),
  ).toBeVisible();
  await expect(page.locator("#root")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute(
    "data-close-requested",
    "true",
  );
});
