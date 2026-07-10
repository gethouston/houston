// Shared labels + a pure presentation helper for ChatSuggestReusableCard.
// DOM-free (mirroring chat-plan-ready-card-model.ts) so the node:test suite can
// drive the save-label decision without a DOM runner; the .tsx component maps
// the resolved label to a row verbatim (icons are internal to the component).
//
// This card is simpler than the plan-ready card: it has exactly TWO actions
// (Save, Not now), not three, and the two rows have no per-row description. So
// there is no generic action-list resolver here (that would be over-engineering
// for two fixed rows). The one branch that isn't a plain prop is the save
// label, which depends on `reusableKind` — that is the single pure helper below.

/** English defaults live in the app; consumers pass `t()` results in. This
 *  constant is the fallback for apps that don't localize the card yet. */
export interface ChatSuggestReusableLabels {
  /** Small eyebrow label above the proposed title (like plan-ready's "Plan ready"). */
  eyebrow: string;
  /** Save action label shown when `reusableKind === "skill"`. */
  skillTitle: string;
  /** Save action label shown when `reusableKind === "routine"`. */
  routineTitle: string;
  /** Dismiss action label. */
  notNow: string;
}

/** English fallbacks for apps that don't localize the suggest-reusable card
 *  yet. No em dashes. */
export const DEFAULT_SUGGEST_REUSABLE_LABELS: ChatSuggestReusableLabels = {
  eyebrow: "Save this for next time",
  skillTitle: "Save as a Skill",
  routineTitle: "Save as a Routine",
  notNow: "Not now",
};

/** The save row's label: the model's just-completed work can be saved either as
 *  a reusable Skill or a scheduled Routine, and the label names which. Pure so
 *  the mapping is unit-tested without a DOM. */
export function resolveSuggestReusableSaveLabel(
  reusableKind: "skill" | "routine",
  labels: ChatSuggestReusableLabels,
): string {
  return reusableKind === "skill" ? labels.skillTitle : labels.routineTitle;
}
