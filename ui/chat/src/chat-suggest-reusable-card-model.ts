export interface ChatSuggestReusableLabels {
  eyebrow: string;
  skillTitle: string;
  routineTitle: string;
  learningTitle: string;
  notNow: string;
}

export const DEFAULT_SUGGEST_REUSABLE_LABELS: ChatSuggestReusableLabels = {
  eyebrow: "Save this for next time",
  skillTitle: "Save as a Skill",
  routineTitle: "Save as an Automation",
  learningTitle: "Remember this",
  notNow: "Not now",
};

export function resolveSuggestReusableSaveLabel(
  reusableKind: "skill" | "routine" | "learning",
  labels: ChatSuggestReusableLabels,
): string {
  if (reusableKind === "skill") return labels.skillTitle;
  if (reusableKind === "routine") return labels.routineTitle;
  return labels.learningTitle;
}
