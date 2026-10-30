import { expect, test } from "./support/fixtures";
import { openSettings } from "./support/settings-nav";

for (const width of [412, 1440]) {
  test(`next-step suggestions persist and round-trip at ${width}px`, async ({
    page,
    request,
    fakeHost,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await openSettings(page);
    const toggle = page.getByRole("switch", {
      name: "Next-step suggestions",
      exact: true,
    });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toBeChecked();
    await toggle.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/token-burn/hou172-suggest-settings-after-${width}.png`,
      animations: "disabled",
    });
    await toggle.click();
    await expect(toggle).not.toBeChecked();
    const stored = await request.get(
      `${fakeHost.url}/v1/preferences/next_step_suggestions`,
    );
    expect(await stored.json()).toEqual({ value: "false" });
    await page.reload();
    await openSettings(page);
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    const restored = await request.get(
      `${fakeHost.url}/v1/preferences/next_step_suggestions`,
    );
    expect(await restored.json()).toEqual({ value: "true" });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(0);
  });
}
