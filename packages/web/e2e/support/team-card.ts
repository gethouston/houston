/**
 * Helpers for the "Build your team" card's own controls: its two opening
 * choices and one hire walked from the in-app hire.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { type PressMode, press } from "./mobile-nav";
import { INDUSTRY_ANSWER } from "./onboarding";

/**
 * The job every team-card hire in the specs takes: one of the survey
 * industry's (Manufacturing) own catalog jobs, so it is on the first screen of
 * chips without a search.
 */
export const TEAM_HIRE_ROLE = "Production planner";

/**
 * Hire ONE AI Employee on the "Build your team" card, from its opening choice
 * or from "Hire another": the industry the survey answered is preselected (so
 * Continue confirms it), a job chip answers the next question outright, and
 * the naming card's "Hire" lands the roster. `mode` lets the phone specs tap.
 */
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
    page.getByRole("radio", { name: INDUSTRY_ANSWER }),
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
  await teamCardNameField(page, TEAM_HIRE_ROLE).fill(name);
  await press(page.getByRole("button", { name: "Hire", exact: true }), mode);
  await expect(page.getByRole("heading", { name: /^You hired/ })).toBeVisible();
}

/** The team card's first choice: hire one AI Employee at a time. */
export function hireYourTeamOption(page: Page): Locator {
  return page.getByRole("button", { name: /^Hire your team/ });
}

/** The team card's other first choice: the ready-made team of three. */
export function basicTeamOption(page: Page): Locator {
  return page.getByRole("button", { name: /^Start with a basic team/ });
}

/**
 * The name field on an employee card, labelled by the job it was hired for.
 * `.first()` is the caller's call when two cards share a job. Empty, it shows
 * example names, led by the job when the field has room for it whole ("e.g.
 * Executive assistant, Assistant 3, Jerry"), otherwise "e.g. Ava"; required.
 */
export function teamCardNameField(page: Page, role: string): Locator {
  return page.getByRole("textbox", { name: `Name (${role})` });
}

/** Which of the card's two brief lines, as the questions name them. */
export type TeamCardBriefField = "role" | "industry";

/**
 * A card's job or industry line, by the answer it carries: a button named
 * "Change role: <job>". `.first()` is the caller's call when cards share an
 * answer (every starter opens on the survey's industry).
 */
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

/** The question a brief line opens: a popover on a desktop, a bottom sheet on
 *  a phone, named for the fact it changes. */
export function teamCardBriefPicker(
  page: Page,
  field: TeamCardBriefField,
): Locator {
  return page.getByRole("dialog", {
    name: field === "role" ? "Role" : "Industry",
  });
}
