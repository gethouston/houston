import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
} from "@playwright/test";
import { prefilledName } from "./employee-name";
import { openMoreMenu, type PressMode, press } from "./mobile-nav";
import { seedAnsweredSurvey } from "./onboarding";
import { workspaceMenuTrigger } from "./workspace-menu";

export const TEAM_CARD_INDUSTRY = "Manufacturing";

export const BASIC_TEAM_ROLES = [
  "Executive assistant",
  "Production planner",
  "Production supervisor",
] as const;

export const TEAM_HIRE_ROLE = "Production planner";

export async function openNewWorkspaceTeamCard(
  page: Page,
  request: APIRequestContext,
  device: "desktop" | "phone" = "desktop",
): Promise<Locator> {
  await seedAnsweredSurvey(request, TEAM_CARD_INDUSTRY.toLowerCase());
  await page.goto("/");
  const switcher =
    device === "desktop"
      ? workspaceMenuTrigger(page)
      : (await openMoreMenu(page, "click")).getByTestId(
          "more-workspace-switcher",
        );
  await switcher.click();
  await page.getByRole("menuitem", { name: "Create workspace" }).click();
  const naming = page.getByRole("dialog", { name: "New workspace" });
  await naming
    .getByRole("textbox", { name: "Workspace name" })
    .fill("Acme Corp");
  await naming
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  const card = page.getByRole("dialog", { name: "Let's build your team" });
  await expect(card).toBeVisible();
  return card;
}

export async function hireOnTeamCard(
  page: Page,
  name: string,
  mode: PressMode = "click",
): Promise<void> {
  await expect(
    page.getByRole("heading", {
      name: "What industry does this AI Employee work in?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: TEAM_CARD_INDUSTRY }),
  ).toHaveAttribute("aria-checked", "true");
  await press(
    page.getByRole("button", { name: "Continue", exact: true }),
    mode,
  );
  await press(
    page.getByRole("radio", { name: TEAM_HIRE_ROLE, exact: true }),
    mode,
  );
  await expect(
    page.getByRole("heading", { name: "Name your AI Employee", exact: true }),
  ).toBeVisible();
  const field = teamCardNameField(page, TEAM_HIRE_ROLE);
  await expect(field).toHaveValue(prefilledName(TEAM_HIRE_ROLE));
  await field.fill(name);
  await press(page.getByRole("button", { name: "Hire", exact: true }), mode);
  await expect(page.getByRole("heading", { name: /^You hired/ })).toBeVisible();
}

export function hireYourTeamOption(page: Page): Locator {
  return page.getByRole("button", { name: /^Hire your team/ });
}

export function basicTeamOption(page: Page): Locator {
  return page.getByRole("button", { name: /^Start with a basic team/ });
}

export function teamCardNameField(page: Page, role: string): Locator {
  return page.getByRole("textbox", { name: `Name (${role})` });
}

export type TeamCardBriefField = "role" | "industry";

export function teamCardBriefLine(
  page: Page,
  field: TeamCardBriefField,
  answer: string,
): Locator {
  return page.getByRole("button", {
    name: `Change ${field}: ${answer}`,
    exact: true,
  });
}

export function teamCardBriefPicker(
  page: Page,
  field: TeamCardBriefField,
): Locator {
  return page.getByRole("dialog", {
    name: field === "role" ? "Role" : "Industry",
  });
}
