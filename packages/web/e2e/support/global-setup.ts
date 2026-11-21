import { chromium, type FullConfig } from "@playwright/test";
import { AUTH_WEB_URL, WEB_URL } from "../config";
import { signInAsViewer } from "./identity";
import { seedPage } from "./seed";

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await seedPage(page);
    await page.goto(WEB_URL, { timeout: 120_000 });
    await page
      .locator('[data-tour-target="sidebar"]')
      .waitFor({ state: "visible", timeout: 120_000 });

    const authPage = await browser.newPage();
    await seedPage(authPage);
    await authPage.goto(AUTH_WEB_URL, { timeout: 120_000 });
    await authPage
      .getByRole("button", { name: "Continue with Google" })
      .waitFor({ state: "visible", timeout: 120_000 });

    await signInAsViewer(authPage, { shellTimeout: 120_000 });
  } finally {
    await browser.close();
  }
}
