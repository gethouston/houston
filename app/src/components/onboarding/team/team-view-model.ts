/**
 * Which screen the "Build your team" card stands on, and every move between
 * them, as plain data so the walk is testable without rendering.
 *
 * Two paths leave the choice. HIRE walks the three questions of the in-app
 * hire (industry, job, name) once per AI Employee and returns to the roster of
 * everyone hired so far. BASIC shows the three-person starter team, asking for
 * the industry first only when the survey left none to use.
 */

export type HireStep = "context" | "role" | "customize";

export type TeamView =
  | { kind: "choice" }
  | { kind: "hire"; step: HireStep }
  | { kind: "hired" }
  | { kind: "basicIndustry" }
  /** `viaIndustry`: arrived through the industry screen, so Back returns to
   *  it and the answer stays changeable. */
  | { kind: "basic"; viaIndustry: boolean };

export const TEAM_CHOICE: TeamView = { kind: "choice" };

/** What the walk needs to know about the run it is on. */
export interface TeamWalkFacts {
  /** An industry is already answered (from the survey, or picked here). */
  hasIndustry: boolean;
  /** AI Employees on this run's roster, joining or hired. */
  hiredCount: number;
}

export function startHire(): TeamView {
  return { kind: "hire", step: "context" };
}

export function startBasic(facts: TeamWalkFacts): TeamView {
  return facts.hasIndustry
    ? { kind: "basic", viaIndustry: false }
    : { kind: "basicIndustry" };
}

const NEXT_HIRE_STEP: Record<HireStep, HireStep | null> = {
  context: "role",
  role: "customize",
  customize: null,
};

/** The screen after an answered question. A hire that lands is `hired`. */
export function nextTeamView(view: TeamView): TeamView {
  if (view.kind === "hire") {
    const step = NEXT_HIRE_STEP[view.step];
    return step ? { kind: "hire", step } : { kind: "hired" };
  }
  if (view.kind === "basicIndustry")
    return { kind: "basic", viaIndustry: true };
  return view;
}

/**
 * The screen Back leads to, or null on the choice, the first screen.
 *
 * The roster leads back to the choice, which shows everyone hired so far, so
 * the basic team is always one Back away and switching paths never undoes a
 * hire. Leaving the first question of "Hire another" returns to the roster
 * the person came from.
 */
export function previousTeamView(
  view: TeamView,
  facts: TeamWalkFacts,
): TeamView | null {
  switch (view.kind) {
    case "choice":
      return null;
    case "hired":
      return TEAM_CHOICE;
    case "hire":
      if (view.step === "customize") return { kind: "hire", step: "role" };
      if (view.step === "role") return { kind: "hire", step: "context" };
      return facts.hiredCount > 0 ? { kind: "hired" } : TEAM_CHOICE;
    case "basicIndustry":
      return TEAM_CHOICE;
    case "basic":
      return view.viaIndustry ? { kind: "basicIndustry" } : TEAM_CHOICE;
  }
}

/** Stable identity of a screen, for keys and the entrance animation. */
export function teamViewKey(view: TeamView): string {
  return view.kind === "hire" ? `hire-${view.step}` : view.kind;
}

/** The onboarding funnel step a screen belongs to, or null for none. */
export type TeamFunnelStep = "teamHire" | "teamBasic";

export function teamFunnelStep(view: TeamView): TeamFunnelStep | null {
  if (view.kind === "hire" || view.kind === "hired") return "teamHire";
  if (view.kind === "basic" || view.kind === "basicIndustry") {
    return "teamBasic";
  }
  return null;
}
