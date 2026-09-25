import { fillAgentBrief, newAgentRow } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import { reachBuildTeamCard, resetToFirstRun } from "./support/onboarding";
import { basicTeamOption, teamCardNameField } from "./support/team-card";
import { pinTheme, THEMES } from "./visual/support";

for (const theme of THEMES) {
  test(`naming keeps keyboard focus and color selection coherent in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await newAgentRow(page).click();
    await fillAgentBrief(page);
    await pinTheme(page, theme);
    const dialog = page.getByRole("dialog", {
      name: "Name your AI Employee",
      exact: true,
    });
    const name = dialog.getByRole("textbox", {
      name: "Name (Financial analyst)",
    });
    await expect(name).toBeFocused();
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveAttribute("aria-required", "true");
    await expect(dialog.getByText("New hire", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Create AI Employee" }).click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("Add a name to continue")).toBeVisible();

    await name.press("Tab");
    const suggest = dialog.getByRole("button", { name: "Suggest a name" });
    await expect(suggest).toBeFocused();
    await suggest.press("Enter");
    await expect(name).not.toHaveValue("");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");
    await suggest.press("Tab");
    const colorButton = dialog.getByRole("button", { name: "Change color" });
    await expect(colorButton).toBeFocused();
    await colorButton.press("Enter");
    const palette = page.getByRole("radiogroup", { name: "Color" });
    const colors = palette.getByRole("radio");
    await expect(colors).toHaveCount(10);
    await page.keyboard.press("Home");
    await expect(colors.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(colors.nth(5)).toBeFocused();
    await expect(colors.nth(5)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("End");
    await expect(colors.nth(9)).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(colors.nth(0)).toBeFocused();
    await expect(colors.nth(0)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(colorButton).toBeFocused();
    await colorButton.press("Tab");
    const role = dialog.getByRole("button", {
      name: "Change role: Financial analyst",
    });
    await expect(role).toBeFocused();
    await role.press("Enter");
    const picker = page.getByRole("dialog", { name: "Role", exact: true });
    await expect(picker).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(role).toBeFocused();
    await role.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Change industry: Finance" }),
    ).toBeFocused();
  });
}

for (const width of [1280, 375]) {
  test(`the basic team's names and palettes fit at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await resetToFirstRun(request);
    await page.goto("/");
    await reachBuildTeamCard(page);
    await basicTeamOption(page).click();
    const first = teamCardNameField(page, "Executive assistant");
    await expect(first).toBeVisible();
    const last = teamCardNameField(page, "Finance manager");
    const fits = await first.evaluate((field) => {
      let node: HTMLElement | null = field.parentElement;
      let scrollContainers = 0;
      while (node) {
        if (getComputedStyle(node).overflowY === "auto") {
          scrollContainers += 1;
          if (node.scrollHeight > node.clientHeight + 1) return false;
        }
        node = node.parentElement;
      }
      return scrollContainers > 0;
    });
    expect(fits).toBe(true);
    if (width >= 768) {
      const positions = await Promise.all([
        first.boundingBox(),
        last.boundingBox(),
      ]);
      expect(positions[0]?.y).toBe(positions[1]?.y);
      expect(positions[1]?.x).toBeGreaterThan(positions[0]?.x ?? 0);
      await expect(last).toBeInViewport();
      const frame = await page.locator(".setup-step-in").boundingBox();
      expect(frame?.width).toBe(1152);
      for (const role of ["Executive assistant", "Operations manager"]) {
        const row = page.getByRole("button", { name: `Change role: ${role}` });
        expect(
          await row.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
      }
    } else {
      const third = page.getByRole("button", { name: "Show card 3 of 3" });
      await third.click();
      await expect(last).toBeInViewport();
      await expect(third).toHaveAttribute("aria-current", "true");
      await last.fill("Felix");
      await page.getByRole("button", { name: "Hire my team" }).click();
      await expect(first).toBeFocused();
      await expect(first).toBeInViewport();
    }
    await expect(page.getByRole("radiogroup", { name: "Color" })).toHaveCount(
      0,
    );
    const colorButton = page
      .getByRole("button", { name: "Change color" })
      .first();
    await colorButton.click();
    const palette = page.getByRole("radiogroup", { name: "Color" });
    await expect(palette.getByRole("radio")).toHaveCount(10);
    const rows = await palette
      .getByRole("radio")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).offsetTop),
      );
    expect(new Set(rows).size).toBe(2);
    expect(rows.filter((top) => top === rows[0])).toHaveLength(5);
    expect(
      await palette.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(colorButton).toBeFocused();
  });
}
