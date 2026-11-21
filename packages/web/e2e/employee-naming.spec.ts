import { fillAgentBrief, openNewAgent } from "./support/create-agent";
import { expect, test } from "./support/fixtures";
import {
  BASIC_TEAM_ROLES,
  basicTeamOption,
  openNewWorkspaceTeamCard,
  teamCardNameField,
} from "./support/team-card";
import { pinTheme, THEMES } from "./visual/support";

for (const theme of THEMES) {
  test(`naming keeps keyboard focus and color selection coherent in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await openNewAgent(page);
    await fillAgentBrief(page);
    await pinTheme(page, theme);
    const dialog = page.getByRole("dialog", {
      name: "Name your AI Employee",
      exact: true,
    });
    const name = dialog.getByRole("textbox", {
      name: "Name (Financial analyst)",
    });
    const create = dialog.getByRole("button", { name: "Create AI Employee" });
    await expect(name).toHaveValue("Financial analyst");
    await expect(create).toBeFocused();
    await expect(name).toHaveCSS("font-size", "16px");
    await expect(name).toHaveAttribute("aria-required", "true");
    await expect(dialog.getByText("New hire", { exact: true })).toHaveCount(0);

    await name.click();
    await page.keyboard.type("Ava");
    await expect(name).toHaveValue("Ava");
    await name.fill("");
    await create.click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByText("Add a name to continue")).toBeVisible();
    await name.fill("Ava");
    await expect(name).not.toHaveAttribute("aria-invalid", "true");

    await name.press("Tab");
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
    const industry = dialog.getByRole("button", {
      name: "Change industry: Finance",
    });
    await expect(industry).toBeFocused();
    await industry.press("Tab");
    const colorButton = dialog.getByRole("button", { name: /^Change color: / });
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
    await expect(colorButton).toHaveAccessibleName("Change color: Charcoal");
  });
}

for (const width of [1280, 375]) {
  test(`the basic team's names and palettes fit at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const card = await openNewWorkspaceTeamCard(
      page,
      request,
      width >= 768 ? "desktop" : "phone",
    );
    await basicTeamOption(page).click();
    const first = teamCardNameField(page, "Executive assistant");
    await expect(first).toBeVisible();
    const last = teamCardNameField(page, "Production supervisor");
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    expect(
      await card.evaluate((node) => node.scrollWidth <= node.clientWidth),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: "Hire my team" }),
    ).toBeInViewport();
    const [firstBox, lastBox] = await Promise.all([
      first.boundingBox(),
      last.boundingBox(),
    ]);
    if (width >= 768) {
      const frame = await card.boundingBox();
      expect(frame?.width).toBe(1152);
      for (const role of BASIC_TEAM_ROLES) {
        await expect(teamCardNameField(page, role)).toBeInViewport();
      }
      expect(firstBox?.y).toBe(lastBox?.y);
      expect(lastBox?.x).toBeGreaterThan(firstBox?.x ?? 0);
      for (const role of ["Executive assistant", "Production planner"]) {
        const row = page.getByRole("button", { name: `Change role: ${role}` });
        expect(
          await row.evaluate((node) => node.scrollWidth <= node.clientWidth),
        ).toBe(true);
      }
    } else {
      expect(lastBox?.x).toBe(firstBox?.x);
      expect(lastBox?.y).toBeGreaterThan(firstBox?.y ?? 0);
      await expect(first).toHaveValue("Executive assistant");
      await expect(last).toHaveValue("Production supervisor");
      await last.fill("Felix");
      await first.fill("");
      await last.scrollIntoViewIfNeeded();
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
