export type HireStep = "context" | "role" | "customize";

export type TeamView =
  | { kind: "choice" }
  | { kind: "hire"; step: HireStep }
  | { kind: "hired" }
  | { kind: "basicIndustry" }
  | { kind: "basic"; viaIndustry: boolean };

export const TEAM_CHOICE: TeamView = { kind: "choice" };

export interface TeamWalkFacts {
  hasIndustry: boolean;
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

export function nextTeamView(view: TeamView): TeamView {
  if (view.kind === "hire") {
    const step = NEXT_HIRE_STEP[view.step];
    return step ? { kind: "hire", step } : { kind: "hired" };
  }
  if (view.kind === "basicIndustry")
    return { kind: "basic", viaIndustry: true };
  return view;
}

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

export function teamViewKey(view: TeamView): string {
  return view.kind === "hire" ? `hire-${view.step}` : view.kind;
}

export type TeamFunnelStep = "teamHire" | "teamBasic";

export function teamFunnelStep(view: TeamView): TeamFunnelStep | null {
  if (view.kind === "hire" || view.kind === "hired") return "teamHire";
  if (view.kind === "basic" || view.kind === "basicIndustry") {
    return "teamBasic";
  }
  return null;
}
