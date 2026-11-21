import { expect, test } from "./support/fixtures";
import {
  connectAi,
  INDUSTRY_ANSWER,
  managerStep,
  pickChip,
  ROLE_ANSWER,
} from "./support/manager-onboarding";
import { openManagerOnboarding, resetToFirstRun } from "./support/onboarding";

test("an answer whose push failed rides along on the next one", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);

  const pushed: Array<Record<string, unknown>> = [];
  await page.route("**/v1/me/onboarding", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    pushed.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({
      status: pushed.length === 1 ? 503 : 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await openManagerOnboarding(page);
  await connectAi(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);
  await pickChip(page, "survey-role", ROLE_ANSWER);
  await expect(managerStep(page, "survey-companySize")).toBeVisible();

  await expect.poll(() => pushed.length).toBeGreaterThanOrEqual(2);
  expect(pushed[0]).toEqual({ industry: "accounting" });
  expect(pushed.at(-1)).toEqual({ role: "bookkeeper", industry: "accounting" });
});
